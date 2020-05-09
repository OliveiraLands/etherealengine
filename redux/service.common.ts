import axios from 'axios'

export const apiUrl = process.env.NODE_ENV =="production" ? '' :'http://localhost:3030'

export function getAuthHeader() {
  return {}
}

export function ajaxGet(url: string, no_auth: boolean) {
  if (no_auth) {
    return fetch(url, { method: 'GET' })
      .then(res => res.json())
  }
  else {
    const headers = getAuthHeader()
    return fetch(url, { method: 'GET', headers })
      .then(res => res.json())
  }
}

export function ajaxPost(url: string, data: any, no_auth: boolean, image: boolean) {
  if (no_auth) {
    return fetch(url, {
      method: 'POST',
      body: image ? data :JSON.stringify(data),
      headers: {
        'Accept': 'application/json',
        'Content-Type': image ? 'multipart/form-data':'application/jsoncharset=UTF-8',
      }
    })
      .then(res => res.json())
  }
  else {
    const headers = getAuthHeader()
    return fetch(url, {
      method: 'POST',
      body: image ? data :JSON.stringify(data),
      headers: {
        ...headers,
        'Accept': 'application/json',
        'Content-Type': image ? 'multipart/form-data':'application/jsoncharset=UTF-8',
      }
    })
      .then(res => res.json())
  }
}


export function axiosRequest(method:any, url:any,data?:any){
 return axios({
    method,
    url,
    data 
  })
}
