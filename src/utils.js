const https = require('https')
const parseUrl = require('url').parse
const querystring = require('querystring')
const baseUrl = require('./constants').BASE_URL
const UA = require('./constants').UA
const APP_ID = require('./constants').APP_ID

const debug = {}
const ENV = process.env.NODE_ENV
Object.keys(console).forEach(method => {
  debug[method] = function() {
    if (ENV === 'debug' || ENV === 'test') {
      const args = [new Date()].concat([].slice.call(arguments))
      console[method].apply(console, args)
    }
  }
})

function sleep(second) {
  second = second || 1
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, second * 1000)
  })
}

const token = (() => {
  let currentToken = ''
  return {
    get() {
      return currentToken
    },
    set(newToken) {
      currentToken = newToken
      return currentToken
    }
  }
})()

function r(url, options) {
  return new Promise((resolve, reject) => {
    const qs = options ? `?${querystring.stringify(options)}` : ''
    const finalUrl = `${url}${qs}`
    debug.log(`request url: ${finalUrl}`)
    let requestOptions = {
      headers: {
        'User-Agent': UA
      },
    };
    if(process.env.LOCAL_ADDRESS) 
      requestOptions.localAddress = process.env.LOCAL_ADDRESS;
    const req = https.request(Object.assign(parseUrl(finalUrl), requestOptions), res => {
      let body = ''
      res.on('data', chunk => {
        body += chunk
      })
      res.on('end', () => {
        try {
          body = JSON.parse(body)
        } catch (e) {
          debug.error(`request error: ${e}`)
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: body
        })
      })
    })

    req.on('error', err => {
      debug.error(`request failed: ${err}`)
      reject(err)
    })
    req.end()
  })
}

function getToken() {
  return r(baseUrl, {
    get_token: 'get_token',
    app_id: APP_ID
  }).then(res => token.set(res.body.token))
}

function request(url, options) {
  return Promise.resolve(token.get() || getToken()).then(currentToken => {
    options = options || {}
    options.token = currentToken
    return r(url, options)
  }).then(res => {
    if (res.body && res.body.error) {
      if (res.body.error_code == 4) {
        // token expired
        debug.warn(`token expired: ${token.get()}`)
        token.set(null)
        return request(url, options)
      } else if (res.body.error_code == 5 || res.body.error_code == 20) {
        // Too many requests per second
        debug.warn(`too many request`)
        return sleep(2).then(() => request(url, options))
      }
      return res
    } else if (!res.body) {
      // Too many requests per second
      debug.warn(`too many request`)
      return sleep(2).then(() => request(url, options))
    } else {
      return res
    }
  })
}

function proceedExtraParams(params) {
  params = params || {}
  const defaultParams = {
    category: null,
    limit: 25,
    sort: 'last',
    min_seeders: null,
    min_leechers: null,
    format: 'json_extended',
    ranked: null,
    app_id: APP_ID
  }

  const result = {}
  Object.keys(defaultParams).forEach(key => {
    const value = params[key] || defaultParams[key]
    if (!value) return
    result[key] = value
  })

  if (result.category) {
    result.category = result.category.join(';')
  }

  if (!~[25, 50, 100].indexOf(result.limit)) {
    result.limit =  25
  }

  if (!~['last', 'seeders', 'leechers'].indexOf(result.sort)) {
    result.sort = 'last'
  }

  if (typeof result.min_leechers !== 'number') {
    delete result.min_leechers
  }

  if (typeof result.min_seeders !== 'number') {
    delete result.min_seeders
  }

  if (!~['json', 'json_extended'].indexOf(result.format)) {
    result.format = 'json_extended'
  }

  if (result.ranked != 0) {
    delete result.ranked
  }

  return result
}

module.exports = {
  request,
  proceedExtraParams
}
