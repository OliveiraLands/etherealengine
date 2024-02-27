/* eslint-disable no-case-declarations */
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
import React, { useImperativeHandle } from 'react'

import { AssetType } from '@etherealengine/engine/src/assets/enum/AssetType'
import { useHookstate } from '@etherealengine/hyperflux'

import { AudioPreviewPanel } from './AssetPreviewPanels/AudioPreviewPanel'
import { ImagePreviewPanel } from './AssetPreviewPanels/ImagePreviewPanel'
import { JsonPreviewPanel } from './AssetPreviewPanels/JsonPreviewPanel'
import { ModelPreviewPanel } from './AssetPreviewPanels/ModelPreviewPanel'
import { PreviewUnavailable } from './AssetPreviewPanels/PreviewUnavailable'
import { TexturePreviewPanel } from './AssetPreviewPanels/TexturePreviewPanel'
import { TxtPreviewPanel } from './AssetPreviewPanels/TxtPreviewPanel'
import { VideoPreviewPanel } from './AssetPreviewPanels/VideoPreviewPanel'

const assetHeadingStyles = {
  textAlign: 'center',
  fontSize: '0.9rem',
  paddingBottom: '10px',
  color: '#f1f1f1'
}

interface Props {
  hideHeading?: boolean
}

type ResourceProps = {
  resourceUrl: string
  name: string
  size: string | undefined
}

export type AssetSelectionChangePropsType = ResourceProps & {
  contentType: string
}

type PreviewPanel = React.FC<{ resourceProps: ResourceProps }>

const PreviewPanelContentTypes: Array<{ types: Array<string>; panel: PreviewPanel }> = [
  {
    types: [
      'model/gltf',
      'model/gltf-binary',
      'model/glb',
      AssetType.VRM,
      'model/vrm',
      AssetType.glB,
      AssetType.glTF,
      'gltf-binary',
      AssetType.USDZ,
      AssetType.FBX
    ],
    panel: ModelPreviewPanel
  },
  { types: ['image/png', 'image/jpeg', 'png', 'jpeg', 'jpg'], panel: ImagePreviewPanel },
  { types: ['ktx2', 'image/ktx2'], panel: TexturePreviewPanel },
  { types: ['video/mp4', 'mp4', 'm3u8'], panel: VideoPreviewPanel },
  { types: ['audio/mpeg', 'mpeg', 'mp3'], panel: AudioPreviewPanel },
  { types: ['md', 'ts', 'js'], panel: TxtPreviewPanel },
  { types: ['json'], panel: JsonPreviewPanel }
]

const PreviewPanelByContentTypeMap = new Map<string, PreviewPanel>()
for (const entry of PreviewPanelContentTypes) {
  for (const type of entry.types) {
    PreviewPanelByContentTypeMap.set(type, entry.panel)
  }
}

/**
 * Used to see the Preview of the Asset in the FileBrowser Panel
 */
export const AssetsPreviewPanel = React.forwardRef(({ hideHeading }: Props, ref) => {
  useImperativeHandle(ref, () => ({ onSelectionChanged }))
  const currentProps = useHookstate<AssetSelectionChangePropsType>({
    resourceUrl: '',
    name: '',
    size: '',
    contentType: ''
  })

  const onSelectionChanged = async (props: AssetSelectionChangePropsType) => {
    currentProps.set(props)
  }

  const PreviewPanel = PreviewPanelByContentTypeMap.get(currentProps.contentType.value) ?? PreviewUnavailable

  return (
    <>
      {!hideHeading && (
        <div style={assetHeadingStyles as React.CSSProperties}>
          {currentProps.name.value &&
            currentProps.size.value &&
            `${currentProps.name.value} (${currentProps.size.value})`}
        </div>
      )}
      <PreviewPanel resourceProps={currentProps.value} />
    </>
  )
})
