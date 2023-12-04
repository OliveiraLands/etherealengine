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

import { t } from 'i18next'
import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ProjectState } from '@etherealengine/client-core/src/common/services/ProjectService'
import { EngineState } from '@etherealengine/engine/src/ecs/classes/EngineState'
import { getMutableState, useHookstate } from '@etherealengine/hyperflux'
import { loadEngineInjection } from '@etherealengine/projects/loadEngineInjection'

import { LoadingCircle } from '@etherealengine/client-core/src/components/LoadingCircle'
import '@etherealengine/client-core/src/networking/ClientNetworkingSystem'
import '@etherealengine/engine/src/EngineModule'
import { SceneID } from '@etherealengine/engine/src/schemas/projects/scene.schema'
import '../EditorModule'
import EditorContainer from '../components/EditorContainer'
import { EditorState } from '../services/EditorServices'
import { ProjectPage } from './ProjectPage'

export const useStudioEditor = () => {
  const [engineReady, setEngineReady] = useState(false)

  useEffect(() => {
    getMutableState(EngineState).isEditor.set(true)
    getMutableState(EngineState).isEditing.set(true)
    loadEngineInjection().then(() => {
      setEngineReady(true)
    })
  }, [])

  return engineReady
}

export const EditorPage = () => {
  const [params] = useSearchParams()
  const projectState = useHookstate(getMutableState(ProjectState))
  const { sceneID, projectName } = useHookstate(getMutableState(EditorState))

  useEffect(() => {
    const sceneInParams = params.get('scenePath')
    if (sceneInParams) sceneID.set(sceneInParams as SceneID)
    const projectNameInParams = params.get('project')
    if (projectNameInParams) projectName.set(projectNameInParams as SceneID)
  }, [params])

  useEffect(() => {
    if (!sceneID.value) return

    const parsed = new URL(window.location.href)
    const query = parsed.searchParams

    query.set('scenePath', sceneID.value)

    parsed.search = query.toString()
    if (typeof history.pushState !== 'undefined') {
      window.history.replaceState({}, '', parsed.toString())
    }
  }, [sceneID])

  if (!projectState.projects.value.length) return <LoadingCircle message={t('common:loader.loadingEditor')} />

  if (!sceneID.value && !projectName.value) return <ProjectPage />

  return <EditorContainer />
}
