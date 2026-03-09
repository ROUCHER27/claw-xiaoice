import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from './http-transport.js';

/**
 * MCP Integration Plugin for OpenClaw
 * Connects to MCP servers via Streamable HTTP transport
 */
class MCPManager {
  constructor(logger) {
    this.logger = logger;
    this.clients = new Map();
    this.tools = new Map();
  }

  async connectServer(name, config) {
    try {
      const transportType = config.transport || (config.command ? 'stdio' : 'http');
      let transport;

      if (transportType === 'stdio') {
        if (!config.command) {
          throw new Error('Missing "command" for stdio transport');
        }

        this.logger.info(`[MCP] Connecting to ${name} via stdio (${config.command})`);
        transport = new StdioClientTransport({
          command: config.command,
          args: Array.isArray(config.args) ? config.args : [],
          env: config.env && typeof config.env === 'object' ? config.env : undefined,
          cwd: config.cwd,
        });
      } else if (transportType === 'http') {
        if (!config.url) {
          throw new Error('Missing "url" for http transport');
        }

        const url = config.url;
        let safeUrl = url;
        try {
          const u = new URL(url);
          u.password = '';
          u.username = '';
          safeUrl = u.toString();
        } catch (e) {
          // invalid url, just keep it as is or mask it
        }

        this.logger.info(`[MCP] Connecting to ${name} at ${safeUrl}`);
        transport = new StreamableHTTPClientTransport(url);
      } else {
        throw new Error(`Unsupported transport "${transportType}"`);
      }

      const client = new Client(
        { name: `openclaw-${name}`, version: '0.1.0' },
        { capabilities: {} }
      );

      await client.connect(transport);

      const { tools } = await client.listTools();

      this.clients.set(name, { client, transport, transportType });

      // Filter out disabled tools
      const disabledTools = config.disabledTools || [];
      const filteredTools = tools.filter(tool => !disabledTools.includes(tool.name));

      filteredTools.forEach(tool => {
        this.tools.set(`${name}:${tool.name}`, {
          server: name,
          tool,
          client
        });
      });

      if (disabledTools.length > 0) {
        this.logger.info(`[MCP] Connected to ${name}: ${filteredTools.length}/${tools.length} tools available (${disabledTools.length} disabled)`);
      } else {
        this.logger.info(`[MCP] Connected to ${name}: ${tools.length} tools available`);
      }
      return filteredTools;
    } catch (error) {
      this.logger.error(`[MCP] Failed to connect to ${name}: ${error.message}`);
      throw error;
    }
  }

  async callTool(serverName, toolName, args = {}) {
    const toolKey = `${serverName}:${toolName}`;
    const entry = this.tools.get(toolKey);

    if (!entry) {
      throw new Error(`Tool not found: ${toolKey}. Available: ${Array.from(this.tools.keys()).join(', ')}`);
    }

    const result = await entry.client.callTool({ name: toolName, arguments: args });
    return result;
  }

  listTools() {
    const toolList = [];
    for (const [key, entry] of this.tools.entries()) {
      toolList.push({
        id: key,
        server: entry.server,
        name: entry.tool.name,
        description: entry.tool.description,
        inputSchema: entry.tool.inputSchema
      });
    }
    return toolList;
  }

  async disconnect() {
    for (const [name, { client }] of this.clients.entries()) {
      try {
        await client.close();
        this.logger.info(`[MCP] Disconnected from ${name}`);
      } catch (error) {
        this.logger.error(`[MCP] Error disconnecting from ${name}: ${error.message}`);
      }
    }
    this.clients.clear();
    this.tools.clear();
  }
}

/**
 * OpenClaw plugin entry point
 */
export default function register(api) {
  const mcpManager = new MCPManager(api.logger);

  api.registerService({
    id: 'mcp-integration',
    start: async () => {
      api.logger.info('[MCP] Starting...');

      const pluginConfig = api.config?.plugins?.entries?.['mcp-integration']?.config || {};
      const servers = pluginConfig.servers || {};

      api.logger.info(`[MCP] Plugin config: ${JSON.stringify(pluginConfig, null, 2)}`);
      api.logger.info(`[MCP] Found ${Object.keys(servers).length} server(s): ${Object.keys(servers).join(', ')}`);

      for (const [name, config] of Object.entries(servers)) {
        if (config.enabled === false) {
          continue;
        }

        try {
          await mcpManager.connectServer(name, config);
        } catch (error) {
          api.logger.error(`[MCP] Failed to initialize ${name}: ${error.message}`);
        }
      }

      api.logger.info('[MCP] Started');
    },
    stop: async () => {
      api.logger.info('[MCP] Stopping...');
      await mcpManager.disconnect();
    }
  });

  api.registerTool({
    name: 'mcp',
    description: 'Call MCP (Model Context Protocol) server tools. Use action=list to see available tools, then action=call to invoke them.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'call'],
          description: 'Action: list or call'
        },
        server: {
          type: 'string',
          description: 'MCP server name (for call)'
        },
        tool: {
          type: 'string',
          description: 'Tool name (for call)'
        },
        args: {
          type: 'object',
          description: 'Tool arguments (for call)'
        }
      },
      required: ['action']
    },
    async execute(_id, params) {
      try {
        switch (params.action) {
          case 'list': {
            const tools = mcpManager.listTools();
            return {
              content: [{
                type: 'text',
                text: tools.length > 0
                  ? JSON.stringify(tools, null, 2)
                  : 'No MCP tools available. Check server connection.'
              }]
            };
          }

          case 'call': {
            if (!params.server || !params.tool) {
              throw new Error('server and tool are required for call action');
            }
            const result = await mcpManager.callTool(params.server, params.tool, params.args || {});
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }]
            };
          }

          default:
            throw new Error(`Unknown action: ${params.action}`);
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  });

  api.logger.info('[MCP] Plugin registered');
}
