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

import { useTexture } from '@etherealengine/engine/src/assets/functions/resourceHooks'
import createReadableTexture from '@etherealengine/spatial/src/renderer/functions/createReadableTexture'
import { useHookstate } from '@hookstate/core'
import React, { useEffect } from 'react'

const imageStyles = {
  display: 'block',
  marginLeft: 'auto',
  marginRight: 'auto',
  maxHeight: '100%',
  height: 'auto',
  maxWidth: '100%'
}

/**
 * @param props
 */

export const TexturePreviewPanel = (props) => {
  const [tex, texUnload] = useTexture(props.resourceProps.resourceUrl)
  const url = useHookstate<string>('')
  useEffect(() => {
    if (!tex.value) {
      return
    }

    createReadableTexture(tex.value, { url: true }).then((result) => {
      url.set(result as string)
    })

    tex.value.dispose()
    return () => {
      URL.revokeObjectURL(url.value)
    }
  }, [tex])
  useEffect(() => {
    return texUnload
  }, [])
  return (
    <img
      src={url.value}
      alt="Photo"
      crossOrigin="anonymous"
      style={imageStyles}
      onLoad={(event) => props.resourceProps.displayCbk?.(event.target)}
    />
  )
}
