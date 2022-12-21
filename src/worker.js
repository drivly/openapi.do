import { pathToRegexp, match, parse, compile }  from 'path-to-regexp'
import toJSONSchema from '@openapi-contrib/openapi-schema-to-json-schema'

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
    const { user, hostname, pathname, rootPath, pathSegments, query } = await env.CTX.fetch(req).then(res => res.json())
    if (rootPath) return json({ api, gettingStarted, examples, user })
    
    const hst = 'time.series.do'

    // We need to fetch the hostname from the request
    const meta = await fetch(`https://${hst}/api`).then(res => res.json())

    if (pathSegments[1] == 'oas' || pathSegments[1] == 'json-schema') {

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
          path: route(url),
          keys: k
        }
      }

      for (const [name, url] of Object.entries(meta.examples)) {
        // Find an endpoint that matches the URL
        const endpoint = Object.values(endpoints).find(endpoint => endpoint.regex.exec(route(url)))

        // Convert name from camelCase to Title Case
        const title = name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())

        oas.tags.push({
          name: title
        })

        const resp = await fetch(url)

        let content_type = resp.headers.get('content-type')
        
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

      if (pathSegments[1] == 'json-schema') {
        // Convert the OAS to JSON Schema
        const output = {}

        // Recursively convert the response schemas to JSON Schema
        const convert = (schema) => {
          if (schema.properties) {
            for (const [key, val] of Object.entries(schema.properties)) {
              if (val.properties) {
                convert(val)
              } else {
                schema.properties[key] = {
                  type: val.type,
                }
              }
            }
          } else if (schema.items) {
            convert(schema.items)
          }
        }
        
        return new Response(JSON.stringify(output, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
      }

      return new Response(JSON.stringify(oas, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
    }
  }
}

const json = obj => new Response(JSON.stringify(obj, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
