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

import { getEntityComponents } from 'bitecs'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { JSONTree } from 'react-json-tree'

import { AvatarControllerComponent } from '@etherealengine/engine/src/avatar/components/AvatarControllerComponent'
import { respawnAvatar } from '@etherealengine/engine/src/avatar/functions/respawnAvatar'
import { Engine } from '@etherealengine/engine/src/ecs/classes/Engine'
import { EngineState } from '@etherealengine/engine/src/ecs/classes/EngineState'
import { Entity } from '@etherealengine/engine/src/ecs/classes/Entity'
import {
  Component,
  getComponent,
  getOptionalComponent,
  hasComponent
} from '@etherealengine/engine/src/ecs/functions/ComponentFunctions'
import { RootSystemGroup, SimulationSystemGroup } from '@etherealengine/engine/src/ecs/functions/EngineFunctions'
import { entityExists } from '@etherealengine/engine/src/ecs/functions/EntityFunctions'
import { EntityTreeComponent } from '@etherealengine/engine/src/ecs/functions/EntityTree'
import { System, SystemDefinitions, SystemUUID } from '@etherealengine/engine/src/ecs/functions/SystemFunctions'
import { RendererState } from '@etherealengine/engine/src/renderer/RendererState'
import { NameComponent } from '@etherealengine/engine/src/scene/components/NameComponent'
import { UUIDComponent } from '@etherealengine/engine/src/scene/components/UUIDComponent'
import { NO_PROXY, getMutableState, getState, useHookstate } from '@etherealengine/hyperflux'
import Icon from '@etherealengine/ui/src/primitives/mui/Icon'

import { SceneState } from '@etherealengine/engine/src/ecs/classes/Scene'
import ActionsPanel from './ActionsPanel'
import { StatsPanel } from './StatsPanel'
import styles from './styles.module.scss'

type DesiredType =
  | {
      preSystems?: Record<SystemUUID, DesiredType>
      simulation?: DesiredType
      subSystems?: Record<SystemUUID, DesiredType>
      postSystems?: Record<SystemUUID, DesiredType>
    }
  | boolean // enabled

const convertSystemTypeToDesiredType = (system: System): DesiredType => {
  const { preSystems, subSystems, postSystems } = system
  if (preSystems.length === 0 && subSystems.length === 0 && postSystems.length === 0) {
    return true
  }
  const desired: DesiredType = {}
  if (preSystems.length > 0) {
    desired.preSystems = preSystems.reduce(
      (acc, uuid) => {
        acc[uuid] = convertSystemTypeToDesiredType(SystemDefinitions.get(uuid)!)
        return acc
      },
      {} as Record<SystemUUID, DesiredType>
    )
  }
  if (system.uuid === RootSystemGroup) {
    desired.simulation = convertSystemTypeToDesiredType(SystemDefinitions.get(SimulationSystemGroup)!)
  }
  if (subSystems.length > 0) {
    desired.subSystems = subSystems.reduce(
      (acc, uuid) => {
        acc[uuid] = convertSystemTypeToDesiredType(SystemDefinitions.get(uuid)!)
        return acc
      },
      {} as Record<SystemUUID, DesiredType>
    )
  }
  if (postSystems.length > 0) {
    desired.postSystems = postSystems.reduce(
      (acc, uuid) => {
        acc[uuid] = convertSystemTypeToDesiredType(SystemDefinitions.get(uuid)!)
        return acc
      },
      {} as Record<SystemUUID, DesiredType>
    )
  }
  return desired
}

export const Debug = ({ showingStateRef }: { showingStateRef: React.MutableRefObject<boolean> }) => {
  useHookstate(getMutableState(EngineState).frameTime).value
  const rendererState = useHookstate(getMutableState(RendererState))
  const engineState = useHookstate(getMutableState(EngineState))

  engineState.frameTime.value // make Engine.instance data reactive in the render tree

  const { t } = useTranslation()
  const hasActiveControlledAvatar =
    !!Engine.instance.localClientEntity && hasComponent(Engine.instance.localClientEntity, AvatarControllerComponent)

  const onClickRespawn = (): void => {
    Engine.instance.localClientEntity && respawnAvatar(Engine.instance.localClientEntity)
  }

  const toggleDebug = () => {
    rendererState.physicsDebug.set(!rendererState.physicsDebug.value)
  }

  const toggleAvatarDebug = () => {
    rendererState.avatarDebug.set(!rendererState.avatarDebug.value)
  }

  const renderEntityTreeRoots = () => {
    return {
      ...Object.values(getState(SceneState).scenes)
        .map((scene, i) => {
          const root = scene.snapshots[scene.index].data.root
          const entity = UUIDComponent.entitiesByUUID[root]
          if (!entity || !entityExists(entity)) return null
          return {
            [`${i} - ${getComponent(entity, NameComponent) ?? getComponent(entity, UUIDComponent)}`]:
              renderEntityTree(entity)
          }
        })
        .filter((exists) => !!exists)
    }
  }

  const renderEntityTree = (entity: Entity) => {
    const node = getComponent(entity, EntityTreeComponent)
    return {
      components: renderEntityComponents(entity),
      children: {
        ...node.children.reduce(
          (r, child) =>
            Object.assign(r, {
              [`${child} - ${getComponent(child, NameComponent) ?? getComponent(child, UUIDComponent)}`]:
                renderEntityTree(child)
            }),
          {}
        )
      }
    }
  }

  const renderEntityComponents = (entity: Entity) => {
    return Object.fromEntries(
      entityExists(entity)
        ? getEntityComponents(Engine.instance, entity).reduce<[string, any][]>((components, C: Component<any, any>) => {
            if (C !== NameComponent) {
              const component = getComponent(entity, C)
              if (typeof component === 'object') components.push([C.name, { ...component }])
              else components.push([C.name, component])
            }
            return components
          }, [])
        : []
    )
  }

  const renderAllEntities = () => {
    return {
      ...Object.fromEntries(
        [...Engine.instance.entityQuery().entries()]
          .map(([key, eid]) => {
            try {
              return [
                '(eid:' +
                  eid +
                  ') ' +
                  (getOptionalComponent(eid, NameComponent) ?? getOptionalComponent(eid, UUIDComponent) ?? ''),
                renderEntityComponents(eid)
              ]
            } catch (e) {
              return null!
            }
          })
          .filter((exists) => !!exists)
      )
    }
  }

  const toggleNodeHelpers = () => {
    getMutableState(RendererState).nodeHelperVisibility.set(!getMutableState(RendererState).nodeHelperVisibility.value)
  }

  const toggleGridHelper = () => {
    getMutableState(RendererState).gridVisibility.set(!getMutableState(RendererState).gridVisibility.value)
  }

  const namedEntities = useHookstate({})
  const erroredComponents = useHookstate([] as any[])
  const entityTree = useHookstate({} as any)

  const dag = convertSystemTypeToDesiredType(SystemDefinitions.get(RootSystemGroup)!)

  namedEntities.set(renderAllEntities())
  entityTree.set(renderEntityTreeRoots())

  erroredComponents.set(
    [...Engine.instance.store.activeReactors.values()]
      .filter((reactor) => (reactor as any).entity && reactor.errors.length)
      .map((reactor) => {
        return reactor.errors.map((error) => {
          return {
            entity: (reactor as any).entity,
            component: (reactor as any).component,
            error
          }
        })
      })
      .flat()
  )

  return (
    <div className={styles.debugContainer} style={{ pointerEvents: 'all' }}>
      <div className={styles.debugOptionContainer}>
        <h1>{t('common:debug.debugOptions')}</h1>
        <div className={styles.optionBlock}>
          <div className={styles.flagContainer}>
            <button
              type="button"
              onClick={toggleDebug}
              className={styles.flagBtn + (rendererState.physicsDebug.value ? ' ' + styles.active : '')}
              title={t('common:debug.debug')}
            >
              <Icon type="SquareFoot" fontSize="small" />
            </button>
            <button
              type="button"
              onClick={toggleAvatarDebug}
              className={styles.flagBtn + (rendererState.avatarDebug.value ? ' ' + styles.active : '')}
              title={t('common:debug.debug')}
            >
              <Icon type="Person" fontSize="small" />
            </button>
            <button
              type="button"
              onClick={toggleNodeHelpers}
              className={styles.flagBtn + (rendererState.nodeHelperVisibility.value ? ' ' + styles.active : '')}
              title={t('common:debug.nodeHelperDebug')}
            >
              <Icon type="SelectAll" fontSize="small" />
            </button>
            <button
              type="button"
              onClick={toggleGridHelper}
              className={styles.flagBtn + (rendererState.gridVisibility.value ? ' ' + styles.active : '')}
              title={t('common:debug.gridDebug')}
            >
              <Icon type="GridOn" fontSize="small" />
            </button>
            <button
              type="button"
              onClick={() => rendererState.forceBasicMaterials.set(!rendererState.forceBasicMaterials.value)}
              className={styles.flagBtn + (rendererState.forceBasicMaterials.value ? ' ' + styles.active : '')}
              title={t('common:debug.forceBasicMaterials')}
            >
              <Icon type="FormatColorReset" fontSize="small" />
            </button>
            {hasActiveControlledAvatar && (
              <button type="button" className={styles.flagBtn} id="respawn" onClick={onClickRespawn}>
                <Icon type="Refresh" />
              </button>
            )}
          </div>
        </div>
      </div>
      <StatsPanel show={showingStateRef.current} />
      <div className={styles.jsonPanel}>
        <h1>{t('common:debug.entityTree')}</h1>
        <JSONTree
          data={entityTree.value}
          postprocessValue={(v: any) => v?.value ?? v}
          shouldExpandNodeInitially={(keyPath, data: any, level) =>
            !!data.components && !!data.children && typeof data.entity === 'number'
          }
        />
      </div>
      <div className={styles.jsonPanel}>
        <h1>{t('common:debug.entities')}</h1>
        <JSONTree data={namedEntities.get(NO_PROXY)} />
      </div>
      <div className={styles.jsonPanel}>
        <h1>{t('common:debug.erroredEntities')}</h1>
        <JSONTree data={erroredComponents.get(NO_PROXY)} />
      </div>
      <div className={styles.jsonPanel}>
        <h1>{t('common:debug.state')}</h1>
        <JSONTree
          data={Engine.instance.store.stateMap}
          postprocessValue={(v: any) => (v?.value && v.get(NO_PROXY)) ?? v}
        />
      </div>
      <ActionsPanel />
      <div className={styles.jsonPanel}>
        <h1>{t('common:debug.systems')}</h1>
        <JSONTree
          data={dag}
          labelRenderer={(raw, ...keyPath) => {
            const label = raw[0]
            if (label === 'preSystems' || label === 'simulation' || label === 'subSystems' || label === 'postSystems')
              return <span style={{ color: 'green' }}>{t(`common:debug.${label}`)}</span>
            return <span style={{ color: 'black' }}>{label}</span>
          }}
          valueRenderer={(raw, value, ...keyPath) => {
            const system = SystemDefinitions.get((keyPath[0] === 'enabled' ? keyPath[1] : keyPath[0]) as SystemUUID)!
            const systemReactor = system ? Engine.instance.activeSystemReactors.get(system.uuid) : undefined
            return (
              <>
                {systemReactor &&
                  systemReactor.errors.map((error, i) => (
                    <span key={i} style={{ color: 'red' }}>
                      {error.name}: {error.message}
                    </span>
                  ))}
              </>
            )
          }}
          shouldExpandNodeInitially={() => true}
        />
      </div>
    </div>
  )
}

export const DebugToggle = () => {
  const [isShowing, setShowing] = useState(false)
  const showingStateRef = useRef(isShowing)

  useEffect(() => {
    function downHandler({ keyCode }) {
      if (keyCode === 192) {
        showingStateRef.current = !showingStateRef.current
        setShowing(showingStateRef.current)
        getMutableState(EngineState).systemPerformanceProfilingEnabled.set(showingStateRef.current)
      }
    }
    window.addEventListener('keydown', downHandler)
    return () => {
      window.removeEventListener('keydown', downHandler)
    }
  }, [])

  return isShowing ? <Debug showingStateRef={showingStateRef} /> : <></>
}

export default DebugToggle
