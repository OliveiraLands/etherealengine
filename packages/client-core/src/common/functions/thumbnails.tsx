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

import { StaticResourceType } from '@etherealengine/common/src/schema.type.module'
import { PreviewPanelByContentTypeMap } from '@etherealengine/editor/src/components/assets/AssetsPreviewPanel'
import React, { Component, ReactNode } from 'react'
import { Root, createRoot } from 'react-dom/client'

export function getCanvasBlob(canvas: HTMLCanvasElement, fileType = 'image/jpeg', quality = 0.9): Promise<Blob | null> {
  if ((canvas as any).msToBlob) {
    return Promise.resolve((canvas as any).msToBlob())
  } else {
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, fileType, quality))
  }
}

class MountDetector extends Component<{ children: ReactNode | undefined; onmount: () => void | undefined }> {
  mounted: boolean
  mountCbk: () => void

  constructor(props) {
    super(props)
    this.mountCbk = props.onmount
  }

  componentDidMount() {
    this.mounted = true
    this.mountCbk?.()
  }

  render() {
    return <>{this.props.children}</>
  }
}

export const fileTypeCanHaveThumbnail = (type: string): boolean => {
  const descriptor = PreviewPanelByContentTypeMap.get(type)
  if (descriptor == null) {
    return false
  }
  return descriptor.useForThumbnails ?? false
}

const dudImage = new Image()

export const createThumbnailForResource = async (resource: StaticResourceType): Promise<Blob | null> => {
  const descriptor = PreviewPanelByContentTypeMap.get(resource.mimeType)
  if (descriptor == null || descriptor.useForThumbnails == false) {
    return null
  }

  const PreviewPanel: React.FC<any> = descriptor.panel

  let debugBox: HTMLElement | null = document.querySelector('div#debugBox')
  if (debugBox == null) {
    debugBox = document.createElement('div')
    debugBox.id = 'debugBox'
    debugBox.style.position = 'absolute'
    debugBox.style.top = '0'
    debugBox.style.right = '0'
    debugBox.style.zIndex = '100'
    document.body.appendChild(debugBox)
  }

  const domNode = document.createElement('div')
  domNode.style.width = '512px'
  domNode.style.height = '512px'
  domNode.style.borderColor = 'red'
  domNode.style.borderWidth = '1px'
  domNode.style.borderStyle = 'solid'
  domNode.title = resource.key
  debugBox.appendChild(domNode)

  // TODO: move to CSS class, write CSS that can turn off things like video controls

  let imageSource: CanvasImageSource = dudImage
  const root: Root = await new Promise((resolve) => {
    const root: Root = createRoot(domNode)
    root.render(
      <MountDetector
        onmount={() => {
          resolve(root)
        }}
      >
        <PreviewPanel
          resourceProps={{
            resourceUrl: resource.url,
            name: '',
            size: '',
            displayCbk: (source: CanvasImageSource | null) => {
              imageSource = source ?? dudImage
            }
          }}
        />
      </MountDetector>
    )
  })

  const canvas = document.createElement('canvas')
  canvas.width = 90
  canvas.height = 90
  const ctx = canvas.getContext('2d')
  if (ctx == null) {
    return null
  }

  ctx.fillStyle =
    '#' +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, '0') +
    'FF'
  ctx.fillRect(0, 0, 90, 90)

  if (imageSource == null || imageSource === dudImage) {
    return null
  }

  if (imageSource instanceof HTMLVideoElement) {
    const video: HTMLVideoElement = imageSource
    await new Promise<void>((resolve, reject) => {
      video.currentTime = 1
      video.onerror = reject
      video.onseeked = () => {
        video.onerror = null
        video.onseeked = null
        resolve()
      }
    })
  }

  /*
  if (subject instanceof HTMLVideoElement) {
    const videoEl:HTMLVideoElement = subject
    if (videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) {
      await new Promise<void>((resolve, reject) => {
        videoEl.onerror = reject
        videoEl.onloadeddata = () => {
          videoEl.onloadeddata = null
          videoEl.onerror = null
          resolve()
        }
      })
    }
    await new Promise<void>((resolve, reject) => {
      videoEl.currentTime = 1
      videoEl.onerror = reject
      videoEl.onseeked = () => {
        videoEl.onerror = null
        videoEl.onseeked = null
        resolve()
      }
    })
  } else if (subject instanceof HTMLImageElement) {
    const imageEl:HTMLImageElement = subject
    if (!imageEl.complete) {
      await new Promise<void>(resolve => imageEl.onload = () => {
        imageEl.onload = null
        resolve()
      })
    }
  } else if (subject instanceof HTMLCanvasElement) {
    const canvasEl:HTMLCanvasElement = subject
    // const observer = new ResizeObserver(() => {

    // });
    // observer.observe(canvasEl)
    console.log("TODO: canvas draw test")
  }
  */
  ctx.drawImage(imageSource, 0, 0, 90, 90)

  canvas.style.borderColor = 'blue'
  canvas.style.borderWidth = '1px'
  canvas.style.borderStyle = 'solid'
  canvas.title = resource.key
  debugBox.appendChild(canvas)

  const blob = await getCanvasBlob(canvas, 'image/png')
  // root.unmount()

  return blob
}

export const fileThumbnailCache: Map<string, string> = new Map()
