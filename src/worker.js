import { pathToRegexp, match, parse, compile }  from 'path-to-regexp'

export const api = {
  icon: '🚀',
  name: 'templates.do',
  description: 'Cloudflare Worker Template',
  url: 'https://templates.do/api',
  type: 'https://apis.do/templates',
  endpoints: {
    listCategories: 'https://templates.do/api',
    getCategory: 'https://templates.do/:type',
  },
  site: 'https://templates.do',
  login: 'https://templates.do/login',
  signup: 'https://templates.do/signup',
  subscribe: 'https://templates.do/subscribe',
  repo: 'https://github.com/drivly/templates.do',
}

export const gettingStarted = [
  `If you don't already have a JSON Viewer Browser Extension, get that first:`,
  `https://extensions.do`,
]

export const examples = {
  listItems: 'https://templates.do/worker',
}

export default {
  fetch: async (req, env) => {
    try {
      const { user, hostname, pathname, rootPath, pathSegments, query } = await env.CTX.fetch(req).then(res => res.json())
      if (rootPath) return json({ api, gettingStarted, examples, user })
      
      const hst = hostname.includes('roled.org') ? 'time.series.do' : hostname

      // We need to fetch the hostname from the request
      // Using curl.do, we can bypass the Cloudflare Worker problem of not being able to read
      // Other Workers on the same domain.
      let meta = await fetch(
        `https://curl.do/curl https://${hst}/api`,
        {
          headers: {
            'Authorization': `Bearer ${env.CURL_API_KEY}`,
          }
        }
      ).then(res => res.json())

      console.log(meta)

      if (query.pretty) {
        return new Response(null, {
          status: 302,
          headers: {
            location: `https://elements-demo.stoplight.io/?spec=https://${hostname}/api/oas`
          }
        })
      }
      // Generate an OpenAPI Spec using the API and examples properties

      const oas = {
        openapi: '3.0.0',
        info: {
          title: `API specification for ${meta.api.name}`,
          version: '1.0.0',
          description: meta.description,
          contact: {
            name: `Drivly support, bug reports, and feature requests`,
            email: `developers@driv.ly`,
          },
        },
        servers: [
          {
            url: meta.url,
            description: 'Production',
          },
        ],
        tags: [
          {
            name: 'Examples',
            description: 'Example responses for the API endpoints',
          }
        ],
        paths: {},
      }

      console.log(
        oas
      )

      // Add the endpoints to the OAS
      const endpoints = {}

      const route = (r) => r.split('/').slice(3).join('/').replace('<', '_').split('?')[0]

      for (const [name, url] of Object.entries(meta.api.endpoints)) {
        const k = []
        const regex = pathToRegexp(route(url), k) // Convert the URL to a regex

        // Add the endpoint to the OAS
        endpoints[name] = {
          name,
          url,
          regex,
          path: '/' + route(url),
          keys: k
        }
      }

      console.log(endpoints)

      for (const [name, url] of Object.entries(meta.examples)) {
        // Find an endpoint that matches the URL
        const endpoint = Object.values(endpoints).find(endpoint => endpoint.regex.exec(route(url)))

        if (!endpoint) {
          console.log(`No endpoint found for ${name}`)
          continue
        }

        // Convert name from camelCase to Title Case
        const title = name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())

        oas.tags.push({
          name: title
        })

        const resp = await fetch(
          `https://curl.do/curl ${url}`,
          {
            headers: {
              Authorization: `Bearer ${env.CURL_API_KEY}`,
            },
          }
        )

        let content_type = resp.headers.get('content-type').split(';')[0]
        
        // Load the response body
        let body = await resp.text()
        
        if (content_type.includes('json')) {
          body = JSON.parse(body)
        }

        const generate_schema = (item) => {
          // Recursive function to generate an OpenAPI spec from an object or array
          if (Array.isArray(item)) {
            return {
              type: 'array',
              items: generate_schema(item[0]),
            }
          } else if (typeof item == 'object') {
            return {
              type: 'object',
              properties: Object.entries(item).reduce((acc, [key, val]) => {
                acc[key] = generate_schema(val)
                return acc
              }, {}),
            }
          } else {
            return {
              type: typeof item,
            }
          }
        }

        // Add the endpoint to the OAS
        oas.paths[endpoint.path] = {
          get: {
            summary: `[Example] ${title}`,
            description: `Example response for the ${endpoint.name} endpoint`,
            tags: ['Examples'],
            parameters: endpoint.keys.map(key => ({
              name: key.name,
              in: 'path',
              required: true,
              description: `Example value for the ${key.name} parameter`,
              schema: {
                type: 'string',
              },
            })),
            responses: {
              200: {
                description: 'Example response',
                content: {
                  [content_type]: {
                    schema: generate_schema(body),
                  },
                },
              },
            },
          }
        }
      }

      if (pathSegments[2]) {
        const target = pathSegments[2] // Target is an endpoint name that we should convert to another language

        const endpoint = Object.values(endpoints).find(endpoint => endpoint.name == target)

        if (!endpoint) {
          return new Response(null, {
            status: 404,
            headers: {
              'content-type': 'text/plain; charset=utf-8',
            }
          })
        }

        // Convert the endpoint to JSON Schema.
        // This should be pretty simple since we already have the OpenAPI spec

        const schema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          $id: `https://${hostname}/${target}`,
          title: `${target}`,
          description: `Method ${target} on ${hostname}`,
          type: 'object',
          properties: oas.paths[endpoint.path].get.responses['200'].content['application/json'].schema.properties,
        }

        return json(schema)
      }

      return new Response(JSON.stringify(oas, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With' }})
    } catch (e) {
      return new Response(e.stack, { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' }})
    }
  }
}

const json = obj => new Response(JSON.stringify(obj, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})