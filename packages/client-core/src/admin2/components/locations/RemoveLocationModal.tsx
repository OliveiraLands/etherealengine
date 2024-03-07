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

import { PopoverState } from '@etherealengine/client-core/src/common/services/PopoverState'
import { LocationType, locationPath } from '@etherealengine/common/src/schema.type.module'
import { useMutation } from '@etherealengine/spatial/src/common/functions/FeathersHooks'
import LoadingCircle from '@etherealengine/ui/src/primitives/tailwind/LoadingCircle'
import Modal from '@etherealengine/ui/src/primitives/tailwind/Modal'
import Text from '@etherealengine/ui/src/primitives/tailwind/Text'
import { useHookstate } from '@hookstate/core'
import React from 'react'
import { useTranslation } from 'react-i18next'

export default function RemoveLocationModal({ location }: { location: LocationType }) {
  const { t } = useTranslation()
  const adminLocationRemove = useMutation(locationPath).remove
  const submitLoading = useHookstate(false)

  return (
    <Modal
      title={t('admin:components.location.removeLocation')}
      onSubmit={() => {
        submitLoading.set(true)
        adminLocationRemove(location.id).then(() => PopoverState.hidePopupover())
      }}
      onClose={!submitLoading.value ? () => PopoverState.hidePopupover() : undefined}
      submitLoading={submitLoading.value}
    >
      <div className="relative">
        {submitLoading.value && (
          <LoadingCircle className="absolute left-1/2 top-1/2 z-50 my-auto h-1/6 w-1/6 -translate-x-1/2 -translate-y-1/2 cursor-wait" />
        )}
        <Text>{`${t('admin:components.location.confirmLocationDelete')} '${location.name}'?`}</Text>
      </div>
    </Modal>
  )
}