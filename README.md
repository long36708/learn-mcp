

```shell
curl -i -X POST http://localhost:8888/mcp \
 -H "Content-Type: application/json"\
 -H "Accept: application/json, text/event-stream"\
 -H "Authorization: Bearer my-secret-token"\
 -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
   "protocolVersion": "2024-11-05",
   "capabilities": { "interactive": true },
   "clientInfo": { "name": "example-client", "version": "0.0.1" }
  }
 }'
```