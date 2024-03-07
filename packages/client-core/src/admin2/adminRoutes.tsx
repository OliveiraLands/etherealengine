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

import React, { lazy, useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'

import { getMutableState, NO_PROXY, useHookstate } from '@etherealengine/hyperflux'

import { AllowedAdminRoutesState } from '../admin/AllowedAdminRoutesState'
import { AuthState } from '../user/services/AuthService'
import Projects from './components/project'
import { DefaultAdminRoutes } from './DefaultAdminRoutes'

import { ThemeState } from '@etherealengine/client-core/src/common/services/ThemeService'
import '@etherealengine/engine/src/EngineModule'
import Button from '@etherealengine/ui/src/primitives/tailwind/Button'
import PopupMenu from '@etherealengine/ui/src/primitives/tailwind/PopupMenu'
import { useTranslation } from 'react-i18next'
import { HiArrowRightOnRectangle } from 'react-icons/hi2'
import { RouterState } from '../common/services/RouterService'

const $allowed = lazy(() => import('@etherealengine/client-core/src/admin/allowedRoutes'))

const AdminSideBar = () => {
  const allowedRoutes = useHookstate(getMutableState(AllowedAdminRoutesState)).get(NO_PROXY)

  const location = useLocation()
  const { pathname: fullPathName } = location
  const { t } = useTranslation()

  const relativePath = fullPathName.split('/').slice(2).join('/')

  return (
    <aside className="bg-theme-surfaceMain mx-8 rounded-lg px-2 py-4">
      <ul className="space-y-2">
        {Object.entries(allowedRoutes)
          .filter(([_, sidebarItem]) => sidebarItem.access)
          .map(([path, sidebarItem], index) => {
            return (
              <li key={index}>
                <Link to={path}>
                  <Button
                    className={`text-theme-secondary flex w-72 items-center justify-start rounded-xl px-2 py-3 hover:bg-[#212226] ${
                      relativePath === path ? 'bg-theme-primary' : 'bg-theme-surfaceMain'
                    }`}
                    startIcon={sidebarItem.icon}
                  >
                    {t(sidebarItem.name)}
                  </Button>
                </Link>
              </li>
            )
          })}
        <li>
          <Button
            className="bg-theme-surfaceMain text-theme-secondary my-2 flex items-center rounded-sm px-2 py-3 hover:bg-[#212226]"
            startIcon={<HiArrowRightOnRectangle />}
          >
            Log Out
          </Button>
        </li>
      </ul>
    </aside>
  )
}

const AdminRoutes = () => {
  const location = useLocation()
  const admin = useHookstate(getMutableState(AuthState)).user

  const allowedRoutes = useHookstate(getMutableState(AllowedAdminRoutesState))

  const scopes = admin?.scopes?.value

  useEffect(() => {
    allowedRoutes.set(DefaultAdminRoutes)
  }, [])

  useEffect(() => {
    ThemeState.setTheme('dark')
  }, [])

  useEffect(() => {
    for (const [route, state] of Object.entries(allowedRoutes)) {
      const routeScope = state.scope.value
      const hasScope =
        routeScope === '' ||
        scopes?.find((scope) => {
          const [scopeKey, type] = scope.type.split(':')
          return Array.isArray(routeScope) ? routeScope.includes(scopeKey) : scopeKey === routeScope
        })
      state.access.set(!!hasScope)
    }
  }, [scopes])

  useEffect(() => {
    if (admin?.id?.value?.length! > 0 && !admin?.scopes?.value?.find((scope) => scope.type === 'admin:admin')) {
      RouterState.navigate('/', { redirectUrl: location.pathname })
    }
  }, [admin])

  if (admin?.id?.value?.length! > 0 && !admin?.scopes?.value?.find((scope) => scope.type === 'admin:admin')) {
    return <></>
  }

  return (
    <main className="pointer-events-auto mt-6 flex gap-1.5">
      <AdminSideBar />
      <div className="w-[80%]">
        <Routes>
          <Route path="/*" element={<$allowed />} />
          {<Route path="/" element={<Projects />} />}
        </Routes>
      </div>
      <PopupMenu />
    </main>
  )
}

export default AdminRoutes