import ts from 'typescript/lib/tsserverlibrary';
import { GraphQLLanguageServiceAdapter, ScriptSourceHelper } from './graphql-language-service-adapter';
import { LanguageServiceProxyBuilder } from './language-service-proxy-builder';
import { findAllNodes, findNode, TemplateExpressionResolver } from './ts-util';
import { SchemaManagerFactory } from './schema-manager/schema-manager-factory';

function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
  const logger = (msg: string) => info.project.projectService.logger.info(`[ts-graphql-plugin] ${msg}`);
  logger('config: ' + JSON.stringify(info.config));
  const getSourceFile = (fileName: string) => {
    const program = info.languageService.getProgram();
    if (!program) {
      throw new Error();
    }
    const s = program.getSourceFile(fileName);
    if (!s) {
      throw new Error('no source file');
    }
    return s;
  };
  const getNode = (fileName: string, position: number) => {
    return findNode(getSourceFile(fileName), position);
  };
  const getAllNodes = (fileName: string, cond: (n: ts.Node) => boolean) => {
    const s = getSourceFile(fileName);
    return findAllNodes(s, cond);
  };
  const getLineAndChar = (fileName: string, position: number) => {
    const s = getSourceFile(fileName);
    return ts.getLineAndCharacterOfPosition(s, position);
  };
  const schemaManager = new SchemaManagerFactory(info).create();
  const resolver = new TemplateExpressionResolver(info.languageService, (fileName: string) =>
    info.languageServiceHost.getScriptVersion(fileName),
  );
  // resolver.logger = logger;
  const resolveTemplateLiteral = resolver.resolve.bind(resolver);
  const helper: ScriptSourceHelper = {
    getNode,
    getAllNodes,
    getLineAndChar,
    resolveTemplateLiteral,
  };
  const { schema, errors: schemaErrors } = schemaManager.getSchema();
  const tag = info.config.tag;
  const adapter = new GraphQLLanguageServiceAdapter(helper, { schema, schemaErrors, logger, tag });

  const proxy = new LanguageServiceProxyBuilder(info)
    .wrap('getCompletionsAtPosition', delegate => adapter.getCompletionAtPosition.bind(adapter, delegate))
    .wrap('getSemanticDiagnostics', delegate => adapter.getSemanticDiagnostics.bind(adapter, delegate))
    .wrap('getQuickInfoAtPosition', delegate => adapter.getQuickInfoAtPosition.bind(adapter, delegate))
    .build();

  schemaManager.registerOnChange(adapter.updateSchema.bind(adapter));
  schemaManager.start();

  return proxy;
}

const moduleFactory: ts.server.PluginModuleFactory = (mod: { typescript: typeof ts }) => {
  return { create };
};

export default moduleFactory;
