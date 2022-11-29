import {
  Box3,
  Intersection,
  Layers,
  MathUtils,
  Object3D,
  Plane,
  Quaternion,
  Ray,
  Raycaster,
  Vector2,
  Vector3
} from 'three'

import { V_010 } from '@xrengine/engine/src/common/constants/MathConstants'
import { LifecycleValue } from '@xrengine/engine/src/common/enums/LifecycleValue'
import { throttle } from '@xrengine/engine/src/common/functions/FunctionHelpers'
import { Engine } from '@xrengine/engine/src/ecs/classes/Engine'
import { Entity } from '@xrengine/engine/src/ecs/classes/Entity'
import { World } from '@xrengine/engine/src/ecs/classes/World'
import {
  defineQuery,
  getComponent,
  getOptionalComponent,
  hasComponent,
  removeComponent,
  removeQuery,
  setComponent
} from '@xrengine/engine/src/ecs/functions/ComponentFunctions'
import { getEntityNodeArrayFromEntities } from '@xrengine/engine/src/ecs/functions/EntityTree'
import { MouseInput } from '@xrengine/engine/src/input/enums/InputEnums'
import InfiniteGridHelper from '@xrengine/engine/src/scene/classes/InfiniteGridHelper'
import { GroupComponent } from '@xrengine/engine/src/scene/components/GroupComponent'
import { TransformGizmoComponent } from '@xrengine/engine/src/scene/components/TransformGizmo'
import { VisibleComponent } from '@xrengine/engine/src/scene/components/VisibleComponent'
import {
  SnapMode,
  TransformAxis,
  TransformAxisConstraints,
  TransformMode,
  TransformModeType,
  TransformPivot,
  TransformPivotType
} from '@xrengine/engine/src/scene/constants/transformConstants'
import { TransformSpace } from '@xrengine/engine/src/scene/constants/transformConstants'
import { TransformComponent } from '@xrengine/engine/src/transform/components/TransformComponent'
import { dispatchAction, getState } from '@xrengine/hyperflux'

import { EditorCameraComponent, EditorCameraComponentType } from '../classes/EditorCameraComponent'
import { EditorControlComponent } from '../classes/EditorControlComponent'
import { cancelGrabOrPlacement } from '../functions/cancelGrabOrPlacement'
import { EditorControlFunctions } from '../functions/EditorControlFunctions'
import { getIntersectingNodeOnScreen } from '../functions/getIntersectingNode'
import { SceneState } from '../functions/sceneRenderFunctions'
import {
  setTransformMode,
  toggleSnapMode,
  toggleTransformPivot,
  toggleTransformSpace
} from '../functions/transformFunctions'
import { accessEditorHelperState } from '../services/EditorHelperState'
import EditorHistoryReceptor, { EditorHistoryAction } from '../services/EditorHistory'
import EditorSelectionReceptor, { accessSelectionState, SelectionState } from '../services/SelectionServices'

const SELECT_SENSITIVITY = 0.001

export default async function EditorControlSystem(world: World) {
  const editorControlQuery = defineQuery([EditorControlComponent])
  const selectionState = accessSelectionState()
  const editorHelperState = accessEditorHelperState()

  const raycaster = new Raycaster()
  const raycasterResults: Intersection<Object3D>[] = []
  const raycastIgnoreLayers = new Layers()
  const box = new Box3()
  const inverseGizmoQuaternion = new Quaternion()
  const planeNormal = new Vector3()
  const planeIntersection = new Vector3()
  const transformPlane = new Plane()
  const centerViewportPosition = new Vector2()
  const ray = new Ray()
  const dragOffset = new Vector3()
  const dragVector = new Vector3()
  const initDragVector = new Vector3()
  const deltaDragVector = new Vector3()
  const translationVector = new Vector3()
  const constraintVector = new Vector3()
  const prevPos = new Vector3()
  const prevScale = new Vector3()
  const curScale = new Vector3()
  const scaleVector = new Vector3()
  const initRotationDrag = new Vector3()
  const normalizedInitRotationDrag = new Vector3()
  const normalizedCurRotationDrag = new Vector3()
  const curRotationDrag = new Vector3()
  const viewDirection = new Vector3()
  const selectStartPosition = new Vector2()

  const cursorPosition = new Vector2()
  const isMacOS = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  let lastZoom = 0
  let prevRotationAngle = 0

  let cameraComponent: EditorCameraComponentType
  let selectedEntities: (Entity | string)[]
  let selectedParentEntities: (Entity | string)[]
  let selectionCounter: number = 0
  // let gizmoObj: TransformGizmo
  let transformMode: TransformModeType
  let transformPivot: TransformPivotType
  let transformSpace: TransformSpace
  let transformModeChanged = false
  let transformPivotChanged = false
  let transformSpaceChanged = false
  let dragging = false

  const findIntersectObjects = (object: Object3D, excludeObjects?: Object3D[], excludeLayers?: Layers): void => {
    if (
      (excludeObjects && excludeObjects.indexOf(object) !== -1) ||
      (excludeLayers && excludeLayers.test(object.layers)) ||
      !object.visible
    ) {
      return
    }

    raycaster.intersectObject(object, false, raycasterResults)

    for (let i = 0; i < object.children.length; i++) {
      findIntersectObjects(object.children[i], excludeObjects, excludeLayers)
    }
  }

  const getRaycastPosition = (coords: Vector2, target: Vector3, snapAmount: number = 0): void => {
    raycaster.setFromCamera(coords, Engine.instance.currentWorld.camera)
    raycasterResults.length = 0
    raycastIgnoreLayers.set(1)
    const scene = Engine.instance.currentWorld.scene

    const excludeObjects = [] as Object3D[]
    for (const e of selectionState.selectedParentEntities.value) {
      if (typeof e === 'string') {
        const obj = scene.getObjectByProperty('uuid', e)
        if (obj) excludeObjects.push(obj)
      } else {
        const group = getComponent(e, GroupComponent)
        if (group) excludeObjects.push(...group)
      }
    }

    findIntersectObjects(Engine.instance.currentWorld.scene, excludeObjects, raycastIgnoreLayers)
    findIntersectObjects(InfiniteGridHelper.instance)

    raycasterResults.sort((a, b) => a.distance - b.distance)
    if (raycasterResults[0] && raycasterResults[0].distance < 100) target.copy(raycasterResults[0].point)
    else raycaster.ray.at(10, target)

    if (snapAmount) {
      target.set(
        Math.round(target.x / snapAmount) * snapAmount,
        Math.round(target.y / snapAmount) * snapAmount,
        Math.round(target.z / snapAmount) * snapAmount
      )
    }
  }

  const doZoom = (zoom) => {
    const zoomDelta = typeof zoom === 'number' ? zoom - lastZoom : 0
    lastZoom = zoom
    if (cameraComponent) cameraComponent.zoomDelta = zoomDelta
  }

  const throttleZoom = throttle(doZoom, 30, { leading: true, trailing: false })

  const execute = () => {
    if (editorHelperState.isPlayModeEnabled.value || !hasComponent(SceneState.gizmoEntity, TransformGizmoComponent))
      return

    selectedParentEntities = selectionState.selectedParentEntities.value
    selectedEntities = selectionState.selectedEntities.value
    const gizmoObj = getComponent(SceneState.gizmoEntity, TransformGizmoComponent).gizmo

    transformModeChanged = transformMode === editorHelperState.transformMode.value
    transformMode = editorHelperState.transformMode.value

    transformPivotChanged = transformPivot === editorHelperState.transformPivot.value
    transformPivot = editorHelperState.transformPivot.value

    transformSpaceChanged = transformSpace === editorHelperState.transformSpace.value
    transformSpace = editorHelperState.transformSpace.value

    if (!gizmoObj) return

    if (selectedParentEntities.length === 0 || transformMode === TransformMode.Disabled) {
      if (hasComponent(SceneState.gizmoEntity, VisibleComponent))
        removeComponent(SceneState.gizmoEntity, VisibleComponent)
    } else {
      const lastSelection = selectedEntities[selectedEntities.length - 1]
      const isUuid = typeof lastSelection === 'string'

      const lastSelectedTransform = isUuid
        ? Engine.instance.currentWorld.scene.getObjectByProperty('uuid', lastSelection)
        : getOptionalComponent(lastSelection as Entity, TransformComponent)

      if (lastSelectedTransform) {
        const isChanged =
          selectionCounter !== selectionState.selectionCounter.value ||
          transformModeChanged ||
          selectionState.transformPropertyChanged.value

        if (isChanged || transformPivotChanged) {
          if (transformPivot === TransformPivot.Selection) {
            gizmoObj.position.copy(lastSelectedTransform.position)
          } else {
            box.makeEmpty()

            for (let i = 0; i < selectedParentEntities.length; i++) {
              const parentEnt = selectedParentEntities[i]
              const isUuid = typeof parentEnt === 'string'
              if (isUuid) {
                box.expandByObject(Engine.instance.currentWorld.scene.getObjectByProperty('uuid', parentEnt)!)
              } else {
                box.expandByPoint(getComponent(parentEnt, TransformComponent).position)
              }
            }

            box.getCenter(gizmoObj.position)
            if (transformPivot === TransformPivot.Bottom) {
              gizmoObj.position.y = box.min.y
            }
          }
        }

        if (isChanged || transformSpaceChanged) {
          if (transformSpace === TransformSpace.LocalSelection) {
            gizmoObj.quaternion.copy(
              'quaternion' in lastSelectedTransform ? lastSelectedTransform.quaternion : lastSelectedTransform.rotation
            )
          } else {
            gizmoObj.rotation.set(0, 0, 0)
          }

          inverseGizmoQuaternion.copy(gizmoObj.quaternion).invert()
        }

        if ((transformModeChanged || transformSpaceChanged) && transformMode === TransformMode.Scale) {
          gizmoObj.setLocalScaleHandlesVisible(transformSpace !== TransformSpace.World)
        }
        if (!hasComponent(SceneState.gizmoEntity, VisibleComponent))
          setComponent(SceneState.gizmoEntity, VisibleComponent)
      }
    }
    const cursorPositionInput = world.inputState.get(MouseInput.MousePosition)
    if (cursorPositionInput) cursorPosition.set(cursorPositionInput.value[0], cursorPositionInput.value[1])

    const isGrabbing = transformMode === TransformMode.Grab || transformMode === TransformMode.Placement
    const selectStartAndNoGrabbing =
      world.inputState.get(MouseInput.LeftButton)?.lifecycleState === LifecycleValue.Started &&
      !isGrabbing &&
      !editorHelperState.isFlyModeEnabled.value

    if (selectStartAndNoGrabbing) {
      selectStartPosition.copy(cursorPosition)

      if (gizmoObj.activeControls) {
        gizmoObj.selectAxisWithRaycaster(selectStartPosition)

        if (gizmoObj.selectedAxis) {
          planeNormal.copy(gizmoObj.selectedPlaneNormal!).applyQuaternion(gizmoObj.quaternion).normalize()
          transformPlane.setFromNormalAndCoplanarPoint(planeNormal, gizmoObj.position)
          dragging = true
        } else {
          dragging = false
        }
      }
    } else if (gizmoObj.activeControls && !dragging && cursorPosition) {
      gizmoObj.highlightHoveredAxis(cursorPosition)
    }

    const modifier = isMacOS ? world.inputState.get('MetaLeft') : world.inputState.get('ControlLeft')
    const shouldSnap = (editorHelperState.snapMode.value === SnapMode.Grid) === !modifier
    const selectEnd =
      world.inputState.has(MouseInput.LeftButton) &&
      world.inputState.get(MouseInput.LeftButton)!.lifecycleState === LifecycleValue.Ended

    if (dragging || isGrabbing) {
      let constraint
      if (isGrabbing) {
        getRaycastPosition(
          editorHelperState.isFlyModeEnabled.value ? centerViewportPosition : cursorPosition,
          planeIntersection,
          shouldSnap ? editorHelperState.translationSnap.value : 0
        )
        constraint = TransformAxisConstraints.XYZ
      } else {
        ray.origin.setFromMatrixPosition(Engine.instance.currentWorld.camera.matrixWorld)
        ray.direction
          .set(cursorPosition.x, cursorPosition.y, 0)
          .unproject(Engine.instance.currentWorld.camera)
          .sub(ray.origin)
        ray.intersectPlane(transformPlane, planeIntersection)
        constraint = TransformAxisConstraints[gizmoObj.selectedAxis!]
      }

      if (!constraint) {
        console.warn(
          `Axis Constraint is undefined.
            transformAxis was ${gizmoObj.selectedAxis}.
            transformMode was ${transformMode}.
            dragging was ${dragging}.`
        )
      }

      if (selectStartAndNoGrabbing) dragOffset.subVectors(gizmoObj.position, planeIntersection)
      else if (isGrabbing) dragOffset.set(0, 0, 0)

      planeIntersection.add(dragOffset)

      if (
        transformMode === TransformMode.Translate ||
        transformMode === TransformMode.Grab ||
        transformMode === TransformMode.Placement
      ) {
        translationVector
          .subVectors(planeIntersection, gizmoObj.position)
          .applyQuaternion(inverseGizmoQuaternion)
          .multiply(constraint)
        translationVector.applyQuaternion(gizmoObj.quaternion)
        gizmoObj.position.add(translationVector)
        if (shouldSnap) {
          prevPos.copy(gizmoObj.position)
          constraintVector.copy(constraint).applyQuaternion(gizmoObj.quaternion)

          const snapValue = editorHelperState.translationSnap.value
          gizmoObj.position.set(
            constraintVector.x !== 0 ? Math.round(gizmoObj.position.x / snapValue) * snapValue : gizmoObj.position.x,
            constraintVector.y !== 0 ? Math.round(gizmoObj.position.y / snapValue) * snapValue : gizmoObj.position.y,
            constraintVector.z !== 0 ? Math.round(gizmoObj.position.z / snapValue) * snapValue : gizmoObj.position.z
          )

          translationVector.set(
            translationVector.x + gizmoObj.position.x - prevPos.x,
            translationVector.y + gizmoObj.position.y - prevPos.y,
            translationVector.z + gizmoObj.position.z - prevPos.z
          )
        }

        const nodes = getEntityNodeArrayFromEntities(getState(SelectionState).selectedEntities.value)
        EditorControlFunctions.positionObject(nodes, [translationVector], transformSpace, true)

        // if (isGrabbing && transformMode === TransformMode.Grab) {
        //   EditorHistory.grabCheckPoint = (selectedEntities?.find((ent) => typeof ent !== 'string') ?? 0) as Entity
        // }
      } else if (transformMode === TransformMode.Rotate) {
        if (selectStartAndNoGrabbing) {
          initRotationDrag.subVectors(planeIntersection, dragOffset).sub(gizmoObj.position)
          prevRotationAngle = 0
        }
        curRotationDrag.subVectors(planeIntersection, dragOffset).sub(gizmoObj.position)
        normalizedInitRotationDrag.copy(initRotationDrag).normalize()
        normalizedCurRotationDrag.copy(curRotationDrag).normalize()
        let rotationAngle = curRotationDrag.angleTo(initRotationDrag)
        rotationAngle *= normalizedInitRotationDrag.cross(normalizedCurRotationDrag).dot(planeNormal) > 0 ? 1 : -1

        if (shouldSnap) {
          const rotationSnapAngle = MathUtils.DEG2RAD * editorHelperState.rotationSnap.value
          rotationAngle = Math.round(rotationAngle / rotationSnapAngle) * rotationSnapAngle
        }

        const relativeRotationAngle = rotationAngle - prevRotationAngle
        prevRotationAngle = rotationAngle

        const nodes = getEntityNodeArrayFromEntities(getState(SelectionState).selectedEntities.value)
        EditorControlFunctions.rotateAround(nodes, planeNormal, relativeRotationAngle, gizmoObj.position)

        const selectedAxisInfo = gizmoObj.selectedAxisObj?.axisInfo!
        if (selectStartAndNoGrabbing) {
          selectedAxisInfo.startMarker!.visible = true
          selectedAxisInfo.endMarker!.visible = true
          if (transformSpace !== TransformSpace.World) {
            selectedAxisInfo.startMarkerLocal!.position.copy(gizmoObj.position)
            selectedAxisInfo.startMarkerLocal!.quaternion.copy(gizmoObj.quaternion)
            selectedAxisInfo.startMarkerLocal!.scale.copy(gizmoObj.scale)
            Engine.instance.currentWorld.scene.add(selectedAxisInfo.startMarkerLocal!)
          }
        }

        if (transformSpace === TransformSpace.World) {
          if (!selectedAxisInfo.rotationTarget) {
            throw new Error(
              `Couldn't rotate object due to an unknown error. The selected axis is ${
                (gizmoObj as any).selectedAxis.name
              } The selected axis info is: ${JSON.stringify(selectedAxisInfo)}`
            )
          }
          selectedAxisInfo.rotationTarget.rotateOnAxis(selectedAxisInfo.planeNormal, relativeRotationAngle)
        } else {
          gizmoObj.rotateOnAxis(selectedAxisInfo.planeNormal, relativeRotationAngle)
        }

        if (selectEnd) {
          selectedAxisInfo.startMarker!.visible = false
          selectedAxisInfo.endMarker!.visible = false
          selectedAxisInfo.rotationTarget!.rotation.set(0, 0, 0)
          if (transformSpace !== TransformSpace.World) {
            const startMarkerLocal = selectedAxisInfo.startMarkerLocal
            if (startMarkerLocal) Engine.instance.currentWorld.scene.remove(startMarkerLocal)
          }
        }
      } else if (transformMode === TransformMode.Scale) {
        dragVector.copy(planeIntersection).applyQuaternion(inverseGizmoQuaternion).multiply(constraint)

        if (selectStartAndNoGrabbing) {
          initDragVector.copy(dragVector)
          prevScale.set(1, 1, 1)
        }
        deltaDragVector.subVectors(dragVector, initDragVector)
        deltaDragVector.multiply(constraint)

        let scaleFactor =
          gizmoObj.selectedAxis === TransformAxis.XYZ
            ? 1 +
              Engine.instance.currentWorld.camera
                .getWorldDirection(viewDirection)
                .applyQuaternion(gizmoObj.quaternion)
                .dot(deltaDragVector)
            : 1 + constraint.dot(deltaDragVector)

        curScale.set(
          constraint.x === 0 ? 1 : scaleFactor,
          constraint.y === 0 ? 1 : scaleFactor,
          constraint.z === 0 ? 1 : scaleFactor
        )

        if (shouldSnap) {
          curScale
            .divideScalar(editorHelperState.scaleSnap.value)
            .round()
            .multiplyScalar(editorHelperState.scaleSnap.value)
        }

        curScale.set(
          curScale.x <= 0 ? Number.EPSILON : curScale.x,
          curScale.y <= 0 ? Number.EPSILON : curScale.y,
          curScale.z <= 0 ? Number.EPSILON : curScale.z
        )
        scaleVector.copy(curScale).divide(prevScale)
        prevScale.copy(curScale)

        const nodes = getEntityNodeArrayFromEntities(getState(SelectionState).selectedEntities.value)
        EditorControlFunctions.scaleObject(nodes, [scaleVector], transformSpace)
      }
    }

    selectionCounter = selectionState.selectionCounter.value
    cameraComponent = getComponent(Engine.instance.currentWorld.cameraEntity, EditorCameraComponent)
    const shift = world.inputState.has('ShiftLeft')

    if (selectEnd) {
      if (transformMode === TransformMode.Grab) {
        setTransformMode(shift ? TransformMode.Placement : editorHelperState.transformModeOnCancel.value)
      } else if (transformMode === TransformMode.Placement) {
        if (shift) {
          EditorControlFunctions.duplicateObject([])
        } else {
          setTransformMode(editorHelperState.transformModeOnCancel.value)
        }
      } else {
        if (selectStartPosition.distanceTo(cursorPosition) < SELECT_SENSITIVITY) {
          const result = getIntersectingNodeOnScreen(raycaster, cursorPosition)
          if (result) {
            if (result.node) {
              if (shift) {
                EditorControlFunctions.toggleSelection([result.node])
              } else {
                EditorControlFunctions.replaceSelection([result.node])
              }
            }
          } else if (!shift) {
            EditorControlFunctions.replaceSelection([])
          }
        }
        SceneState.transformGizmo.deselectAxis()
        dragging = false
      }
    }

    if (editorHelperState.isFlyModeEnabled.value) return

    if (world.inputState.get('KeyQ')?.lifecycleState === LifecycleValue.Started) {
      const nodes = getEntityNodeArrayFromEntities(getState(SelectionState).selectedEntities.value)
      EditorControlFunctions.rotateAround(
        nodes,
        V_010,
        editorHelperState.rotationSnap.value * MathUtils.DEG2RAD,
        SceneState.transformGizmo.position
      )
    } else if (world.inputState.get('KeyE')?.lifecycleState === LifecycleValue.Started) {
      const nodes = getEntityNodeArrayFromEntities(getState(SelectionState).selectedEntities.value)
      EditorControlFunctions.rotateAround(
        nodes,
        V_010,
        -editorHelperState.rotationSnap.value * MathUtils.DEG2RAD,
        SceneState.transformGizmo.position
      )
    } else if (world.inputState.get('KeyG')?.lifecycleState === LifecycleValue.Started) {
      if (transformMode === TransformMode.Grab || transformMode === TransformMode.Placement) {
        cancelGrabOrPlacement()
        EditorControlFunctions.replaceSelection([])
      }
      if (selectedEntities.length > 0) {
        setTransformMode(TransformMode.Grab)
      }
    } else if (world.inputState.get('Escape')?.lifecycleState === LifecycleValue.Started) {
      cancelGrabOrPlacement()
      EditorControlFunctions.replaceSelection([])
    } else if (
      world.inputState.has('ControlLeft') &&
      world.inputState.has('ShiftLeft') &&
      world.inputState.get('KeyZ')?.lifecycleState === LifecycleValue.Started
    ) {
      dispatchAction(EditorHistoryAction.redo({ count: 1 }))
    } else if (
      world.inputState.has('ControlLeft') &&
      world.inputState.get('KeyZ')?.lifecycleState === LifecycleValue.Started
    ) {
      dispatchAction(EditorHistoryAction.undo({ count: 1 }))
    } else if (world.inputState.get('KeyF')?.lifecycleState === LifecycleValue.Started) {
      cameraComponent.focusedObjects = getEntityNodeArrayFromEntities(selectedEntities)
      cameraComponent.refocus = true
    } else if (world.inputState.get('KeyT')?.lifecycleState === LifecycleValue.Started) {
      setTransformMode(TransformMode.Translate)
    } else if (world.inputState.get('KeyR')?.lifecycleState === LifecycleValue.Started) {
      setTransformMode(TransformMode.Rotate)
    } else if (world.inputState.get('KeyY')?.lifecycleState === LifecycleValue.Started) {
      setTransformMode(TransformMode.Scale)
    } else if (world.inputState.get('KeyC')?.lifecycleState === LifecycleValue.Started) {
      toggleSnapMode()
    } else if (world.inputState.get('KeyX')?.lifecycleState === LifecycleValue.Started) {
      toggleTransformPivot()
    } else if (world.inputState.get('KeyZ')?.lifecycleState === LifecycleValue.Started) {
      toggleTransformSpace()
    } else if (world.inputState.get('Equals')?.lifecycleState === LifecycleValue.Started) {
      InfiniteGridHelper.instance.incrementGridHeight()
    } else if (world.inputState.get('Minus')?.lifecycleState === LifecycleValue.Started) {
      InfiniteGridHelper.instance.decrementGridHeight()
    } else if (world.inputState.get('Delete')?.lifecycleState === LifecycleValue.Started) {
      EditorControlFunctions.removeObject(
        getEntityNodeArrayFromEntities(getState(SelectionState).selectedEntities.value)
      )
    }

    const selecting = world.inputState.has(MouseInput.LeftButton)
    const zoom = world.inputState.get(MouseInput.MouseScroll)?.value?.[0]
    const focusPosition = world.inputState.has(MouseInput.LeftButtonDoubleClick)
    const orbiting = selecting && !dragging
    const panning = world.inputState.has(MouseInput.MiddleButton)

    const mouseMovement = world.inputState.get(MouseInput.MouseClickDownMovement)?.value

    if (focusPosition) {
      raycasterResults.length = 0
      const result = getIntersectingNodeOnScreen(raycaster, cursorPosition, raycasterResults)
      if (result?.node) {
        cameraComponent.focusedObjects = [result.node]
        cameraComponent.refocus = true
      }
    } else if (panning) {
      cameraComponent.isPanning = true
      if (mouseMovement) {
        cameraComponent.cursorDeltaX = mouseMovement[0]
        cameraComponent.cursorDeltaY = mouseMovement[1]
      }
    } else if (orbiting) {
      cameraComponent.isOrbiting = true
      if (mouseMovement) {
        cameraComponent.cursorDeltaX = mouseMovement[0]
        cameraComponent.cursorDeltaY = mouseMovement[1]
      }
    } else if (zoom) {
      throttleZoom(zoom)
    }
  }

  const cleanup = async () => {
    removeQuery(world, editorControlQuery)
  }

  return {
    execute,
    cleanup,
    subsystems: [
      () => Promise.resolve({ default: EditorSelectionReceptor }),
      () => Promise.resolve({ default: EditorHistoryReceptor })
    ]
  }
}
