/*
CPAL-1.0 License

The contents of this file are subject to the Common Public Attribution License
Version 1.0. (the "License"); you may not use this file except in compliance
with the License. You may obtain a copy of the License at
https://github.com/EtherealEngine/etherealengine/blob/dev/LICENSE.
The License is based on the Mozilla Public License Version 1.1, but Sections 14
and 15 have been added to cover use of software over a computer network and 
provide for limited attribution for the Original Developer. In addition, 
Exhibit A has been modified to be consistent with Exhibit B.

Software distributed under the License is distributed on an "AS IS" basis,
WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License for the
specific language governing rights and limitations under the License.

The Original Code is Ethereal Engine.

The Original Developer is the Initial Developer. The Initial Developer of the
Original Code is the Ethereal Engine team.

All portions of the code written by the Ethereal Engine team are Copyright © 2021-2023 
Ethereal Engine. All Rights Reserved.
*/

import { AnimationMixer, InstancedMesh, Mesh, Object3D } from 'three'

import { EntityUUID } from '@etherealengine/common/src/interfaces/EntityUUID'
import { AnimationComponent } from '../../avatar/components/AnimationComponent'
import { Entity } from '../../ecs/classes/Entity'
import {
  ComponentJSONIDMap,
  ComponentMap,
  getComponent,
  getOptionalComponent,
  hasComponent,
  removeComponent,
  setComponent
} from '../../ecs/functions/ComponentFunctions'
import { createEntity } from '../../ecs/functions/EntityFunctions'
import { EntityTreeComponent } from '../../ecs/functions/EntityTree'
import { EngineRenderer } from '../../renderer/WebGLRendererSystem'
import { ComponentJsonType, EntityJsonType } from '../../schemas/projects/scene.schema'
import { LocalTransformComponent } from '../../transform/components/TransformComponent'
import { GLTFLoadedComponent } from '../components/GLTFLoadedComponent'
import { GroupComponent, Object3DWithEntity, addObjectToGroup } from '../components/GroupComponent'
import { InstancingComponent } from '../components/InstancingComponent'
import { MeshComponent } from '../components/MeshComponent'
import { ModelComponent } from '../components/ModelComponent'
import { NameComponent } from '../components/NameComponent'
import { SceneObjectComponent } from '../components/SceneObjectComponent'
import { UUIDComponent } from '../components/UUIDComponent'
import { VisibleComponent } from '../components/VisibleComponent'
import { ObjectLayers } from '../constants/ObjectLayers'
import iterateObject3D from '../util/iterateObject3D'
import { enableObjectLayer } from './setObjectLayers'

//isProxified: used to check if an object is proxified
declare module 'three/src/core/Object3D' {
  export interface Object3D {
    readonly isProxified: true | undefined
  }
}

export const parseECSData = (data: [string, any][]): ComponentJsonType[] => {
  const components: { [key: string]: any } = {}
  const prefabs: { [key: string]: any } = {}

  for (const [key, value] of data) {
    const parts = key.split('.')
    if (parts.length > 1) {
      if (parts[0] === 'xrengine') {
        const componentExists = ComponentMap.has(parts[1])
        const _toLoad = componentExists ? components : prefabs
        if (typeof _toLoad[parts[1]] === 'undefined') {
          _toLoad[parts[1]] = {}
        }
        if (parts.length > 2) {
          let val = value
          if (value === 'true') val = true
          if (value === 'false') val = false
          _toLoad[parts[1]][parts[2]] = val
        }
      }
    }
  }

  const result: ComponentJsonType[] = []
  for (const [key, value] of Object.entries(components)) {
    const component = ComponentMap.get(key)
    if (typeof component === 'undefined') {
      console.warn(`Could not load component '${key}'`)
      continue
    }
    result.push({ name: component.jsonID!, props: value })
  }

  for (const [key, value] of Object.entries(prefabs)) {
    const Component = ComponentJSONIDMap.get(key)!
    if (typeof Component === 'undefined') {
      console.warn(`Could not load component '${key}'`)
      continue
    }
    result.push({ name: Component.jsonID!, props: value })
  }

  return result
}

export const createObjectEntityFromGLTF = (obj3d: Object3D): ComponentJsonType[] => {
  return parseECSData(Object.entries(obj3d.userData))
}

export const parseObjectComponentsFromGLTF = (
  entity: Entity,
  object3d?: Object3D
): Record<EntityUUID, EntityJsonType> => {
  const scene = object3d ?? getComponent(entity, ModelComponent).scene
  const meshesToProcess: Mesh[] = []

  if (!scene) return {}

  scene.traverse((mesh: Mesh) => {
    if ('xrengine.entity' in mesh.userData) {
      meshesToProcess.push(mesh)
    }
  })

  const entities: Entity[] = []
  const entityJson: Record<EntityUUID, EntityJsonType> = {}

  for (const mesh of meshesToProcess) {
    const name = mesh.userData['xrengine.entity'] ?? mesh.uuid
    const uuid = mesh.uuid as EntityUUID
    const eJson: EntityJsonType = {
      name,
      components: []
    }
    eJson.components.push(...createObjectEntityFromGLTF(mesh))

    entityJson[uuid] = eJson
  }

  return entityJson
}

export const parseGLTFModel = (entity: Entity) => {
  const model = getComponent(entity, ModelComponent)
  const scene = model.scene!
  scene.updateMatrixWorld(true)

  // always parse components first using old ECS parsing schema
  const entityJson = parseObjectComponentsFromGLTF(entity, scene)
  const spawnedEntities: Entity[] = []
  // current ECS parsing schema
  iterateObject3D(scene, (obj) => {
    // proxify children property of scene root
    if (obj === scene) {
      Object.defineProperties(obj, {
        children: {
          get() {
            return hasComponent(entity, EntityTreeComponent)
              ? getComponent(entity, EntityTreeComponent)
                  .children.filter((child) => getOptionalComponent(child, GroupComponent)?.length ?? 0 > 0)
                  .flatMap((child) => getComponent(child, GroupComponent))
              : []
          },
          set(value) {
            throw new Error('Cannot set children of proxified object')
          }
        }
      })
      return
    }

    // create entity outside of scene loading reactor since we need to access it before the reactor is guaranteed to have executed
    let objEntity = (obj as Object3DWithEntity).entity
    if (!objEntity) {
      objEntity = (obj as Object3DWithEntity).entity ?? createEntity()
      spawnedEntities.push(objEntity)
    }
    const parentEntity = (obj.parent as Object3DWithEntity).entity
    const uuid = obj.uuid as EntityUUID
    const name = obj.userData['xrengine.entity'] ?? obj.name

    const eJson: EntityJsonType = entityJson[uuid] ?? {
      name,
      components: []
    }
    eJson.parent = getComponent(parentEntity, UUIDComponent)
    setComponent(objEntity, SceneObjectComponent)
    setComponent(objEntity, EntityTreeComponent, {
      parentEntity,
      uuid
    })

    setComponent(objEntity, NameComponent, name)
    eJson.components.push({
      name: LocalTransformComponent.jsonID,
      props: {
        position: obj.position.clone(),
        rotation: obj.quaternion.clone(),
        scale: obj.scale.clone()
      }
    })
    addObjectToGroup(objEntity, obj)
    setComponent(objEntity, GLTFLoadedComponent, ['entity'])
    /** Proxy children with EntityTreeComponent if it exists */
    Object.defineProperties(obj, {
      parent: {
        get() {
          if (EngineRenderer.instance?.rendering) return null
          if (getComponent(objEntity, EntityTreeComponent)?.parentEntity) {
            return getComponent(getComponent(objEntity, EntityTreeComponent).parentEntity!, GroupComponent)?.[0]
          }
          return null
        },
        set(value) {
          throw new Error('Cannot set parent of proxified object')
        }
      },
      children: {
        get() {
          if (EngineRenderer.instance?.rendering) return []
          return hasComponent(objEntity, EntityTreeComponent)
            ? getComponent(objEntity, EntityTreeComponent)
                .children.filter((child) => getOptionalComponent(child, GroupComponent)?.length ?? 0 > 0)
                .flatMap((child) => getComponent(child, GroupComponent))
            : []
        },
        set(value) {
          throw new Error('Cannot set children of proxified object')
        }
      },
      removeFromParent: {
        value: () => {
          if (getComponent(objEntity, EntityTreeComponent)?.parentEntity) {
            setComponent(objEntity, EntityTreeComponent, {
              parentEntity: null
            })
          }
        }
      },
      isProxified: {
        get() {
          return true
        }
      }
    })

    const findColliderData = (obj: Object3D) => {
      if (Object.keys(obj.userData).find((key) => key.startsWith('xrengine.collider'))) {
        return true
      } else if (obj.parent) {
        return Object.keys(obj.parent.userData).some((key) => key.startsWith('xrengine.collider'))
      }
      return false
    }
    //if we're not using visible component, set visible by default
    if (
      !obj.userData['useVisible'] &&
      //if this object has a collider component attached to it, set visible to false
      !findColliderData(obj)
    ) {
      eJson.components.push({
        name: VisibleComponent.jsonID,
        props: true
      })
    }

    // check if this object is part of a collider group
    const inColliderGroup =
      obj.parent?.userData && Object.keys(obj.parent.userData).some((key) => key.startsWith('xrengine.collider'))
    if (!inColliderGroup) {
      const mesh = obj as Mesh
      mesh.isMesh && setComponent(objEntity, MeshComponent, mesh)

      //check if mesh is instanced. If so, add InstancingComponent
      const instancedMesh = obj as InstancedMesh
      instancedMesh.isInstancedMesh &&
        setComponent(objEntity, InstancingComponent, {
          instanceMatrix: instancedMesh.instanceMatrix
        })

      if (obj.userData['componentJson']) {
        eJson.components.push(...obj.userData['componentJson'])
      }
    }
    entityJson[uuid] = eJson
  })

  enableObjectLayer(scene, ObjectLayers.Scene, true)

  // if the model has animations, we may have custom logic to initiate it. editor animations are loaded from `loop-animation` below
  if (scene.animations?.length) {
    // We only have to update the mixer time for this animations on each frame
    if (getComponent(entity, AnimationComponent)) removeComponent(entity, AnimationComponent)
    setComponent(entity, AnimationComponent, {
      mixer: new AnimationMixer(scene),
      animations: scene.animations
    })
  }

  return entityJson
}
