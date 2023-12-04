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

import { useEffect } from 'react'
import { Box3, Box3Helper, BufferGeometry, Mesh } from 'three'

import { getMutableState, getState, useHookstate } from '@etherealengine/hyperflux'

import { matches } from '../../common/functions/MatchesUtils'
import { Entity, UndefinedEntity } from '../../ecs/classes/Entity'
import {
  defineComponent,
  getComponent,
  setComponent,
  useComponent,
  useOptionalComponent
} from '../../ecs/functions/ComponentFunctions'
import { createEntity, removeEntity, useEntityContext } from '../../ecs/functions/EntityFunctions'
import { RendererState } from '../../renderer/RendererState'
import { GroupComponent, addObjectToGroup } from '../../scene/components/GroupComponent'
import { NameComponent } from '../../scene/components/NameComponent'
import { VisibleComponent } from '../../scene/components/VisibleComponent'
import { ObjectLayers } from '../../scene/constants/ObjectLayers'
import { setObjectLayers } from '../../scene/functions/setObjectLayers'

export const BoundingBoxComponent = defineComponent({
  name: 'BoundingBoxComponent',

  onInit: (entity) => {
    return {
      box: new Box3(),
      helper: UndefinedEntity
    }
  },

  onSet: (entity, component, json) => {
    if (!json) return
    if (matches.array.test(json.box)) component.box.value.copy(json.box)
  },

  reactor: function () {
    const entity = useEntityContext()
    const debugEnabled = useHookstate(getMutableState(RendererState).nodeHelperVisibility)
    const boundingBox = useComponent(entity, BoundingBoxComponent)
    const group = useOptionalComponent(entity, GroupComponent)

    useEffect(() => {
      if (!group?.length) return

      computeBoundingBox(entity)

      if (!debugEnabled.value) return

      const helperEntity = createEntity()
      setComponent(helperEntity, NameComponent, `bounding-box-helper-${entity}`)

      const helper = new Box3Helper(boundingBox.box.value)
      helper.name = `bounding-box-helper-${entity}`

      setComponent(helperEntity, VisibleComponent)

      setObjectLayers(helper, ObjectLayers.NodeHelper)
      addObjectToGroup(helperEntity, helper)
      boundingBox.helper.set(helperEntity)

      return () => {
        removeEntity(helperEntity)
        boundingBox.helper.set(UndefinedEntity)
      }
    }, [debugEnabled, group])

    return null
  }
})

export const updateBoundingBoxAndHelper = (entity: Entity) => {
  updateBoundingBox(entity)

  const debugEnabled = getState(RendererState).nodeHelperVisibility
  if (!debugEnabled) return

  const boundingBox = getComponent(entity, BoundingBoxComponent)
  const helperEntity = boundingBox.helper
  const helperObject = getComponent(helperEntity, GroupComponent)?.[0] as any as Box3Helper
  if (!helperObject) return

  helperObject.box.copy(boundingBox.box)
  helperObject.updateMatrixWorld(true)
}

export const computeBoundingBox = (entity: Entity) => {
  const box = getComponent(entity, BoundingBoxComponent).box
  const group = getComponent(entity, GroupComponent)

  box.makeEmpty()

  for (const obj of group) {
    obj.traverse(traverseComputeBoundingBox)
    try {
      box.expandByObject(obj, true)
    } catch (e) {
      console.warn('Error expanding bounding box', e)
    }
  }
}

export const updateBoundingBox = (entity: Entity) => {
  const box = getComponent(entity, BoundingBoxComponent).box
  const group = getComponent(entity, GroupComponent) as any as Mesh<BufferGeometry>[]
  box.makeEmpty()
  for (const obj of group) expandBoxByObject(obj, box, 0)
}

const traverseComputeBoundingBox = (mesh: Mesh) => {
  if (mesh.isMesh) {
    if (mesh.geometry.attributes.position && mesh.geometry.attributes.position.array.length < 3) return //console.warn('Empty mesh geometry', mesh)
    mesh.geometry.computeBoundingBox()
  }
}

const _box = new Box3()

const expandBoxByObject = (object: Mesh<BufferGeometry>, box: Box3, layer: number) => {
  const geometry = object.geometry

  if (geometry) {
    if (geometry.boundingBox === null) {
      geometry.computeBoundingBox()
    }

    _box.copy(geometry.boundingBox!)
    _box.applyMatrix4(object.matrixWorld)
    box.union(_box)
  }

  const children = object.children as Mesh<BufferGeometry>[]

  for (let i = 0, l = children.length; i < l; i++) {
    expandBoxByObject(children[i], box, i)
  }
}

export const BoundingBoxDynamicTag = defineComponent({ name: 'BoundingBoxDynamicTag' })
