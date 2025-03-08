#!/usr/bin/env node

/**
 * MCP server for shadcn/ui component references
 * This server provides tools to:
 * - List all available shadcn/ui components
 * - Get detailed information about specific components
 * - Get usage examples for components
 * - Search for components by keyword
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Interface for component information
 */
interface ComponentInfo {
  name: string;
  description: string;
  url: string;
  sourceUrl?: string;
  apiReference?: string;
  installation?: string;
  usage?: string;
  props?: Record<string, ComponentProp>;
  examples?: ComponentExample[];
}

/**
 * Interface for component property information
 */
interface ComponentProp {
  type: string;
  description: string;
  required: boolean;
  default?: string;
  example?: string;
}

/**
 * Interface for component example
 */
interface ComponentExample {
  title: string;
  code: string;
  description?: string;
}

/**
 * ShadcnUiServer class that handles all the component reference functionality
 */
class ShadcnUiServer {
  private server: Server;
  private axiosInstance;
  private componentCache: Map<string, ComponentInfo> = new Map();
  private componentsListCache: ComponentInfo[] | null = null;
  private readonly SHADCN_DOCS_URL = "https://ui.shadcn.com";
  private readonly SHADCN_GITHUB_URL = "https://github.com/shadcn-ui/ui";
  private readonly SHADCN_RAW_GITHUB_URL = "https://raw.githubusercontent.com/shadcn-ui/ui/main";

  constructor() {
    this.server = new Server(
      {
        name: "shadcn-ui-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ShadcnUiMcpServer/0.1.0)",
      },
    });
    
    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Set up the tool handlers for the server
   */
  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "list_shadcn_components",
          description: "Get a list of all available shadcn/ui components",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
        {
          name: "get_component_details",
          description: "Get detailed information about a specific shadcn/ui component",
          inputSchema: {
            type: "object",
            properties: {
              componentName: {
                type: "string",
                description: "Name of the shadcn/ui component (e.g., \"accordion\", \"button\")",
              },
            },
            required: ["componentName"],
          },
        },
        {
          name: "get_component_examples",
          description: "Get usage examples for a specific shadcn/ui component",
          inputSchema: {
            type: "object",
            properties: {
              componentName: {
                type: "string",
                description: "Name of the shadcn/ui component (e.g., \"accordion\", \"button\")",
              },
            },
            required: ["componentName"],
          },
        },
        {
          name: "search_components",
          description: "Search for shadcn/ui components by keyword",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query to find relevant components",
              },
            },
            required: ["query"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case "list_shadcn_components":
          return await this.handleListComponents();
        case "get_component_details":
          return await this.handleGetComponentDetails(request.params.arguments);
        case "get_component_examples":
          return await this.handleGetComponentExamples(request.params.arguments);
        case "search_components":
          return await this.handleSearchComponents(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  /**
   * Handle the list_shadcn_components tool request
   */
  private async handleListComponents() {
    try {
      if (!this.componentsListCache) {
        // Fetch the list of components
        const response = await this.axiosInstance.get(`${this.SHADCN_DOCS_URL}/docs/components`);
        const $ = cheerio.load(response.data);
        
        const components: ComponentInfo[] = [];
        
        // Extract component links
        $("a").each((_, element) => {
          const link = $(element);
          const url = link.attr("href");
          
          if (url && url.startsWith("/docs/components/")) {
            const name = url.split("/").pop() || "";
            
            components.push({
              name,
              description: "", // Will be populated when fetching details
              url: `${this.SHADCN_DOCS_URL}${url}`,
            });
          }
        });
        
        this.componentsListCache = components;
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(this.componentsListCache, null, 2),
          },
        ],
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch shadcn/ui components: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Validates component name from arguments
   * @param args Arguments object
   * @returns Validated component name
   * @throws McpError if validation fails
   */
  private validateComponentName(args: any): string {
    if (!args?.componentName || typeof args.componentName !== "string") {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Component name is required and must be a string"
      );
    }
    return args.componentName.toLowerCase();
  }

  /**
   * Validates search query from arguments
   * @param args Arguments object
   * @returns Validated search query
   * @throws McpError if validation fails
   */
  private validateSearchQuery(args: any): string {
    if (!args?.query || typeof args.query !== "string") {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Search query is required and must be a string"
      );
    }
    return args.query.toLowerCase();
  }

  /**
   * Handles Axios errors consistently
   * @param error The caught error
   * @param context Context information for the error message
   * @throws McpError with appropriate error code and message
   */
  private handleAxiosError(error: unknown, context: string): never {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `${context} not found`
        );
      } else {
        throw new McpError(
          ErrorCode.InternalError,
          `${context}: ${error.message}`
        );
      }
    }
    throw error;
  }

  /**
   * Creates a standardized success response
   * @param data Data to include in the response
   * @returns Formatted response object
   */
  private createSuccessResponse(data: any) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  /**
   * Handle the get_component_details tool request
   */
  private async handleGetComponentDetails(args: any) {
    const componentName = this.validateComponentName(args);

    try {
      // Check cache first
      if (this.componentCache.has(componentName)) {
        return this.createSuccessResponse(this.componentCache.get(componentName));
      }

      // Fetch component details
      const componentInfo = await this.fetchComponentDetails(componentName);
      
      // Save to cache
      this.componentCache.set(componentName, componentInfo);
      
      return this.createSuccessResponse(componentInfo);
    } catch (error) {
      this.handleAxiosError(error, `Component "${componentName}"`);
    }
  }

  /**
   * Fetches component details from the shadcn/ui documentation
   * @param componentName Name of the component to fetch
   * @returns Component information
   */
  private async fetchComponentDetails(componentName: string): Promise<ComponentInfo> {
    const response = await this.axiosInstance.get(`${this.SHADCN_DOCS_URL}/docs/components/${componentName}`);
    const $ = cheerio.load(response.data);
    
    // Extract component information
    const title = $("h1").first().text().trim();
    
    // Extract description properly
    const description = this.extractDescription($);
    
    // Extract GitHub source code link
    const sourceUrl = `${this.SHADCN_GITHUB_URL}/tree/main/apps/www/registry/default/ui/${componentName}`;
    
    // Extract installation instructions
    const installation = this.extractInstallation($);
    
    // Extract usage examples
    const usage = this.extractUsage($);
    
    // Extract variant information
    const props = this.extractVariants($, componentName);
    
    return {
      name: componentName,
      description,
      url: `${this.SHADCN_DOCS_URL}/docs/components/${componentName}`,
      sourceUrl,
      installation: installation.trim(),
      usage: usage.trim(),
      props: Object.keys(props).length > 0 ? props : undefined,
    };
  }

  /**
   * Extracts component description from the page
   * @param $ Cheerio instance
   * @returns Extracted description
   */
  private extractDescription($: cheerio.CheerioAPI): string {
    let description = "";
    const descriptionElement = $("h1").first().next("p");
    if (descriptionElement.length > 0) {
      // Get only text content, removing any JavaScript code
      const clonedElement = descriptionElement.clone();
      clonedElement.find("script").remove();
      description = clonedElement.text().trim();
    }
    return description;
  }

  /**
   * Extracts installation instructions from the page
   * @param $ Cheerio instance
   * @returns Installation instructions
   */
  private extractInstallation($: cheerio.CheerioAPI): string {
    let installation = "";
    const installSection = $("h2").filter((_, el) => $(el).text().trim() === "Installation");
    if (installSection.length > 0) {
      // Find installation command
      const codeBlock = installSection.nextAll("pre").first();
      if (codeBlock.length > 0) {
        installation = codeBlock.text().trim();
      }
    }
    return installation;
  }

  /**
   * Extracts usage examples from the page
   * @param $ Cheerio instance
   * @returns Usage examples
   */
  private extractUsage($: cheerio.CheerioAPI): string {
    let usage = "";
    const usageSection = $("h2").filter((_, el) => $(el).text().trim() === "Usage");
    if (usageSection.length > 0) {
      const codeBlocks = usageSection.nextAll("pre");
      if (codeBlocks.length > 0) {
        codeBlocks.each((_, el) => {
          usage += $(el).text().trim() + "\n\n";
        });
      }
    }
    return usage;
  }

  /**
   * Extracts variant information from the page
   * @param $ Cheerio instance
   * @param componentName Name of the component
   * @returns Object containing variant properties
   */
  private extractVariants($: cheerio.CheerioAPI, componentName: string): Record<string, ComponentProp> {
    const props: Record<string, ComponentProp> = {};
    
    // Extract variants from Examples section
    const examplesSection = $("h2").filter((_, el) => $(el).text().trim() === "Examples");
    if (examplesSection.length > 0) {
      // Find each variant
      const variantHeadings = examplesSection.nextAll("h3");
      
      variantHeadings.each((_, heading) => {
        const variantName = $(heading).text().trim();
        
        // Get variant code example
        let codeExample = "";
        
        // Find Code tab
        const codeTab = $(heading).nextAll(".tabs-content").first();
        if (codeTab.length > 0) {
          const codeBlock = codeTab.find("pre");
          if (codeBlock.length > 0) {
            codeExample = codeBlock.text().trim();
          }
        }
        
        props[variantName] = {
          type: "variant",
          description: `${variantName} variant of the ${componentName} component`,
          required: false,
          example: codeExample
        };
      });
    }
    
    return props;
  }

  /**
   * Handle the get_component_examples tool request
   */
  private async handleGetComponentExamples(args: any) {
    const componentName = this.validateComponentName(args);

    try {
      // Fetch component examples
      const examples = await this.fetchComponentExamples(componentName);
      return this.createSuccessResponse(examples);
    } catch (error) {
      this.handleAxiosError(error, `Component examples for "${componentName}"`);
    }
  }

  /**
   * Fetches component examples from documentation and GitHub
   * @param componentName Name of the component
   * @returns Array of component examples
   */
  private async fetchComponentExamples(componentName: string): Promise<ComponentExample[]> {
    const response = await this.axiosInstance.get(`${this.SHADCN_DOCS_URL}/docs/components/${componentName}`);
    const $ = cheerio.load(response.data);
    
    const examples: ComponentExample[] = [];
    
    // Collect examples from different sources
    this.collectGeneralCodeExamples($, examples);
    this.collectSectionExamples($, "Usage", "Basic usage example", examples);
    this.collectSectionExamples($, "Link", "Link usage example", examples);
    await this.collectGitHubExamples(componentName, examples);
    
    return examples;
  }

  /**
   * Collects general code examples from the page
   * @param $ Cheerio instance
   * @param examples Array to add examples to
   */
  private collectGeneralCodeExamples($: cheerio.CheerioAPI, examples: ComponentExample[]): void {
    const codeBlocks = $("pre");
    codeBlocks.each((i, el) => {
      const code = $(el).text().trim();
      if (code) {
        // Find heading before code block
        let title = "Code Example " + (i + 1);
        let description = "Code example";
        
        // Look for headings
        let prevElement = $(el).prev();
        while (prevElement.length && !prevElement.is("h1") && !prevElement.is("h2") && !prevElement.is("h3")) {
          prevElement = prevElement.prev();
        }
        
        if (prevElement.is("h2") || prevElement.is("h3")) {
          title = prevElement.text().trim();
          description = `${title} example`;
        }
        
        examples.push({
          title,
          code,
          description
        });
      }
    });
  }

  /**
   * Collects examples from a specific section
   * @param $ Cheerio instance
   * @param sectionName Name of the section to collect from
   * @param descriptionPrefix Prefix for the description
   * @param examples Array to add examples to
   */
  private collectSectionExamples(
    $: cheerio.CheerioAPI, 
    sectionName: string, 
    descriptionPrefix: string,
    examples: ComponentExample[]
  ): void {
    const section = $("h2").filter((_, el) => $(el).text().trim() === sectionName);
    if (section.length > 0) {
      const codeBlocks = section.nextAll("pre");
      codeBlocks.each((i, el) => {
        const code = $(el).text().trim();
        if (code) {
          examples.push({
            title: `${sectionName} Example ${i + 1}`,
            code: code,
            description: descriptionPrefix
          });
        }
      });
    }
  }

  /**
   * Collects examples from GitHub repository
   * @param componentName Name of the component
   * @param examples Array to add examples to
   */
  private async collectGitHubExamples(componentName: string, examples: ComponentExample[]): Promise<void> {
    try {
      const githubResponse = await this.axiosInstance.get(
        `${this.SHADCN_RAW_GITHUB_URL}/apps/www/registry/default/example/${componentName}-demo.tsx`
      );
      
      if (githubResponse.status === 200) {
        examples.push({
          title: "GitHub Demo Example",
          code: githubResponse.data,
        });
      }
    } catch (error) {
      // Continue even if GitHub fetch fails
      console.error(`Failed to fetch GitHub example for ${componentName}:`, error);
    }
  }

  /**
   * Handle the search_components tool request
   */
  private async handleSearchComponents(args: any) {
    const query = this.validateSearchQuery(args);

    try {
      // Ensure components list is loaded
      await this.ensureComponentsListLoaded();
      
      // Filter components matching the search query
      const results = this.searchComponentsByQuery(query);
      
      return this.createSuccessResponse(results);
    } catch (error) {
      this.handleAxiosError(error, "Search failed");
    }
  }

  /**
   * Ensures the components list is loaded in cache
   * @throws McpError if components list cannot be loaded
   */
  private async ensureComponentsListLoaded(): Promise<void> {
    if (!this.componentsListCache) {
      await this.handleListComponents();
    }
    
    if (!this.componentsListCache) {
      throw new McpError(
        ErrorCode.InternalError,
        "Failed to load components list"
      );
    }
  }

  /**
   * Searches components by query string
   * @param query Search query
   * @returns Filtered components
   */
  private searchComponentsByQuery(query: string): ComponentInfo[] {
    if (!this.componentsListCache) {
      return [];
    }
    
    return this.componentsListCache.filter(component => {
      return (
        component.name.includes(query) ||
        component.description.toLowerCase().includes(query)
      );
    });
  }

  /**
   * Run the server
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("shadcn/ui MCP server running on stdio");
  }
}

// Create and run the server
const server = new ShadcnUiServer();
server.run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
