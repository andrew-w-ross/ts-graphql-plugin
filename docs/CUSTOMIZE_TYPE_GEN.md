# Customize Type Generator

<!-- toc -->

- [What can Type Generator Addon do ?](#what-can-type-generator-addon-do-)
- [How to implement Type Generator Addon](#how-to-implement-type-generator-addon)
  - [Write `TypeGenAddonFactory` function](#write-typegenaddonfactory-function)
  - [Template String and Addon Factory](#template-string-and-addon-factory)
  - [GraphQL AST hooks](#graphql-ast-hooks)
  - [Custom Scalar hook](#custom-scalar-hook)
  - [Change output files' content using `ctx.source`](#change-output-files-content-using-ctxsource)
    - [Add TypeScript statement](#add-typescript-statement)
    - [Add import statement](#add-import-statement)
- [Addon example](#addon-example)
- [API reference](#api-reference)

<!-- tocstop -->

## What can Type Generator Addon do ?

With Type Generator Addons you can:

- Mapping custom scalar types defined in your GraphQL schema to TypeScript type what you want.
- Generating new complex types using query result types or fragment types.
- Adding comment to generated .ts files, like `/* tslint:disable */`.
- etc,,,

## How to implement Type Generator Addon

### Write `TypeGenAddonFactory` function

First, create a new TypeScript file, `my-addon.ts`, and edit it as the following:

```ts
/* my-addon.ts */

import type { TypeGenAddonFactory } from 'ts-graphql-plugin';

const addonFactory: TypeGenAddonFactory = ctx => {
  return {
    document() {
      ctx.source.writeLeadingComment('Hello, my addon!');
    },
  };
};

module.exports = addonFactory;
```

Next, edit your tsconfig.json and configure to use the above addon:

```js
/* tsconfig.json */
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "ts-graphql-plugin",
        "schema": "schema.graphql",
        "tag": "gql",
        "typegen": {
          "addons": [
            "./my-addon"
          ]
        }
      }
    ]
  }
}
```

Run `ts-graphql-plugin typegen` command. Then, the head of each generated .ts file should be the following:

```ts
/* Hello, my addon! */
/* eslint-disable */
/* This is an autogenerated file. Do not edit this file directly! */

// Your query result / variables / fragments types
```

### Template String and Addon Factory

The core type generator generates type files for each GraphQL template string in your TypeScript source files.

For example, the following `query` template string generates a type file, `__generated__/repository-query.ts` .

```ts
/* ghe-query.ts */

const query = gql`
  # fragment definition
  fragment IssueItem on Issue {
    id
    url
  }

  # fragment definition
  fragment RepoItem on Repository {
    id
    description
    issues(first: 10) {
      nodes {
        ...IssueItem
      }
    }
  }

  # operation definition
  query RepositoryQuery($limit: Int!) {
    viewer {
      repositories(first: $limit) {
        nodes {
          ...RepoItem
        }
      }
    }
  }
`;
```

And `TypeGenAddonFactory` function is called once for each GraphQL template string (i.e. for each output type file). So, the `ctx` argument of this function contains both the input template string and type file content to be output.

`ctx` has also reference to your GraphQL schema.

### GraphQL AST hooks

Addon can implement methods to be called back for top-level GraphQL AST node, `FragmentDefinition` and `OperationDefinition`.
You can access the type declaration statements the core generator created from the fragments or operations in these callback methods. They're useful to create some complex types from query result types or fragment object types.

```ts
const addonFactory: TypeGenAddonFactory = ctx => {
  return {
    fragmentDefinition({ graphqlNode, tsNode }) {
      // graphqlNode is the fragment definition node
      // tsNode is TypeScript type declaration node for the fragment
    },
    operationDefinition({ graphqlNode, tsResultNode, tsVariableNode }) {
      // graphqlNode is the operation(query/mutation/subscription) definition AST node.
      // tsResultNode is TypeScript type declaration node for result of the operation.
      // tsVariableNode is TypeScript type declaration node for variables of the operation.
    },
  };
};
```

And `document` callback is corresponding to the whole GraphQL document AST node. It's typically used to implement post-processing for the output .ts file.

```ts
const addonFactory: TypeGenAddonFactory = ctx => {
  return {
    document({ graphqlNode }) {
      // graphqlNode is the whole GraphQL document AST node.
    },
  };
};
```

### Custom Scalar hook

`customScalar` is a special callback method to customize mapping GraphQL scalar field to TypeScript types.

The core generator outputs `any` for custom scalr fields because the generator does not know which TypeScript type should they be mapped to.

```ts
const addonFactory: TypeGenAddonFactory = ctx => {
  return {
    customScalar({ scalarType }) {
      if (scalarType.name === 'URL') {
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
      }
    },
  };
};
```

The above example maps `URL` custom scalar field to TypeScript string type.

If `customScalar` function returns `undefined`, the core generator determines mapping result.

### Change output files' content using `ctx.source`

`source` in the addon factory context is an utility object to help to change output type file's content.

#### Add TypeScript statement

You can add TypeScript statements to the output file with `pushStatement` function. This function accepts `ts.Statement` AST node object.

```ts
const addonFactory: TypeGenAddonFactory = ctx => {
  return {
    document() {
      const statement = ts.factory.createTypeAliasDeclaration(
        undefined,
        [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
        ts.factory.createIdentifier('Hoge'),
        undefined,
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      );
      ctx.source.pushStatement(statement);
    },
  };
};
```

Tips: [TypeScript AST Viewer](https://ts-ast-viewer.com) is much useful to inspect or create TypeScript AST.

#### Add import statement

Sometimes, you want to import TypeScript types defined in other files and use them with generated types.

```ts
import { AwesomeType } from '../../util/types';

export type RepositoryQuery = {
  viewer: {
    /* ... */
  };
};

export type WrapRepositoryQuery = AwesomeType<RepositoryQuery>;
```

`ctx.source.pushNamedImportIfNeeded` helps to create import declaration:

```ts
/* my-addon.ts */

const addonFactory: TypeGenAddonFactory = ctx => {
  return {
    operationDefinition({ tsResultNode }) {
      ctx.source.pushNamedImportIfNeeded('AwesomeType', '../../util/types');

      ctx.source.pushStatement(
        ts.factory.createTypeAliasDeclaration(
          undefined,
          [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
          ts.factory.createIdentifier(`Wrapts${ResultNode.name.text}`),
          undefined,
          ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('AwesomeType'), [
            ts.factory.createTypeReferenceNode(ts.factory.createIdentifier(tsResultNode.name.text), undefined),
          ]),
        ),
      );
    },
  };
};
```

## Addon example

There is working example of Type Generator Addon under the [project-fixtures/typegen-addon-prj](../project-fixtures/typegen-addon-prj) directory in this repository.

## API reference

See ts-graphql-plugin's .d.ts files or [definition in this repository](../src/typegen/addon/types.ts).