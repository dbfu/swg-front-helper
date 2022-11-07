const { join, relative } = require('path');
const fs = require('fs');
const babel = require('@babel/core');
const t = require('@babel/types');
const generate = require('@babel/generator').default;
const { getTypeBySchema, getNameByType } = require('./utils');

class ServiceGenerate {
  data = {};
  modelPath;
  moduleName;
  useModels = [];
  filePath;

  constructor(filePath) {
    fs.mkdirSync(filePath, { recursive: true });
    this.filePath = filePath;
  }

  generate() {
    let { tags, paths } = this.data;
    if (this.moduleName) {
      tags = tags.filter(o => o.name === this.moduleName);
    }

    tags.forEach(item => {

      const apiKeys = Object.keys(paths).filter(o => o.startsWith(`/${item.name}`));
      const serviceFunctions = [];

      apiKeys.forEach(path => {

        let name = path.substring(1).replace(/\/|-/g, "_").replace(/\{(.+?)\}/g, (_, match) => {
          return `$${match}`;
        });

        if (name.endsWith("_")) {
          name = name.substring(0, name.length - 1);
        }

        Object.keys(paths[path]).forEach(key => {
          const serviceFunction = new ServiceFunction();
          serviceFunction.name = `${key}_${name}`;
          serviceFunction.url = `${path}`;
          serviceFunction.method = key;

          const responses = paths[path][key]?.responses || {};
          if (responses?.default?.content?.['application/json']?.schema?.type === 'array') {
            serviceFunction.responseBodyType = {
              type: 'array',
              valueType: getTypeBySchema(responses?.default?.content?.['application/json']?.schema?.items?.$ref),
            };
          } else if (responses?.default?.content?.['application/json']?.schema?.$ref) {
            serviceFunction.responseBodyType = {
              type: 'obj',
              valueType: getTypeBySchema(responses?.default?.content?.['application/json']?.schema?.$ref)
            };
          } else if (responses?.default?.content?.['text/plan']?.schema?.type) {
            serviceFunction.responseBodyType = {
              valueType: responses?.default?.content?.['text/plan']?.schema?.type,
              type: responses?.default?.content?.['text/plan']?.schema?.type,
            }
          } else {
            serviceFunction.responseBodyType = {
              valueType: 'any',
              type: 'any',
            }
          }

          serviceFunction.desc = paths[path][key]?.description || '';

          if (paths[path][key]?.parameters?.length) {
            paths[path][key]?.parameters.forEach(item => {
              if (item.schema?.$ref) {
                serviceFunction.params.push({
                  type: 'obj',
                  value: getNameByType(getTypeBySchema(item.schema?.$ref)),
                  valueType: getTypeBySchema(item.schema?.$ref),
                  in: item.in,
                });
              } else {
                serviceFunction.params.push({
                  type: item.schema?.type,
                  valueType: item.schema?.type,
                  value: item.name,
                  in: item.in,
                });
              }
            })
          }

          if (paths[path][key]?.requestBody?.content?.['application/json']?.schema?.$ref) {
            const type = getTypeBySchema(paths[path][key]?.requestBody?.content?.['application/json']?.schema?.$ref)
            serviceFunction.requestBodys.push({
              name: getNameByType(type),
              type: type,
            });
          }

          serviceFunctions.push(serviceFunction);
        });

      })


      const file = serviceFunctions.map(item => item.getCode()).join('\n\n');
      const imports = serviceFunctions.map(item => {
        return item.getUseModels();
      }).flat().filter(o => o);

      let importCodeAst = '';

      if (imports.length) {
        importCodeAst = (
          t.importDeclaration(
            [...new Set(imports)].map(item => t.importSpecifier(
              t.identifier(item),
              t.identifier(item),
            )),
            t.stringLiteral(
              relative(this.filePath, this.modelPath)
            )
          )
        )
      }

      this.useModels = [...new Set([...this.useModels, ...imports])];

      const importCode = generate(importCodeAst).code;


      fs.writeFile(
        `${this.filePath}/${item.name}.ts`,
        [
          `import request, { CommonRequestResult } from "@/utils/request"`,
          importCode,
          file,
        ].filter(o => o).join("\n\n"),
        () => { }
      );
    })
  }

}


class ServiceFunction {
  name;
  requestBodys = [];
  requestParams = [];
  url;
  method;
  responseBodyType;
  params = [];
  desc = '';
  modelFilePath;


  getCode() {
    const paramsNames = [
      ...this.requestBodys.map(item => {
        const paramsName = t.identifier(item.name);
        paramsName.typeAnnotation = t.typeAnnotation(
          t.genericTypeAnnotation(
            t.identifier(item.type),
          )
        );
        return paramsName;
      }),
      ...this.params.map(item => {
        const paramsName = t.identifier(item.value);
        paramsName.typeAnnotation = t.typeAnnotation(
          t.genericTypeAnnotation(
            t.identifier(item.valueType),
          )
        );
        return paramsName;
      }),
    ];

    this.requestBodys.map(item => {
      const paramsName = t.identifier(item.name);
      paramsName.typeAnnotation = t.typeAnnotation(
        t.genericTypeAnnotation(
          t.identifier(item.type),
        )
      );
      return paramsName;
    });

    const quasis = [];

    this.url.replace(/\{(.+)\}/g, (_, $1) => {
      quasis.push(t.templateElement({
        raw: $1,
        cooked: $1,
      },
        false,
      ));
    });

    const urlCode = this.url.replace(/\{(.+?)\}/g, ($1) => {
      return `$${$1}`;
    });

    let urlAst = babel.parseSync(`\`${urlCode}\``);
    urlAst = urlAst.program.body[0].expression;

    const queryParams = this.params.filter(o => o.in === 'query');

    const callExpression = t.callExpression(
      t.memberExpression(
        t.identifier('request'),
        t.identifier(this.method),
      ),
      [
        urlAst,
        ...this.requestBodys.map(o => t.identifier(o.name)),
        queryParams.length && t.objectExpression(
          [t.objectProperty(
            t.identifier('params'),
            t.objectExpression(
              [...queryParams.map(item => {
                if (item.type === 'obj') {
                  return t.spreadElement(
                    t.identifier(item.value),
                  )
                } else {
                  return t.objectProperty(
                    t.identifier(item.value),
                    t.identifier(item.value),
                    false,
                    true,
                  )
                }
              }).filter(o => o)]
            )
          )]
        )
      ].filter(o => o),
    );

    callExpression.typeArguments = t.typeParameterInstantiation(
      [t.genericTypeAnnotation(
        t.identifier(this.responseBodyType.type === 'array' ? `${this.responseBodyType.valueType}[]` : this.responseBodyType.valueType),
      )]
    );

    const functionDeclaration = t.functionDeclaration(
      t.identifier(this.name),
      paramsNames,
      t.blockStatement([
        t.returnStatement(
          callExpression
        )
      ]),
    );


    functionDeclaration.returnType = t.typeAnnotation(
      t.genericTypeAnnotation(
        t.identifier('CommonRequestResult'),
        t.typeParameterInstantiation(
          [
            t.genericTypeAnnotation(
              t.identifier(this.responseBodyType.type === 'array' ? `${this.responseBodyType.valueType}[]` : this.responseBodyType.valueType)
            )
          ]
        )
      )
    )

    const ast = t.exportNamedDeclaration(
      functionDeclaration
    );

    return [this.desc ? `/**
* ${this.desc}
*/` : null, generate(ast).code].filter(o => o).join('\n');
  }

  generateFile(code) {
    fs.writeFile(path.join(__dirname, `service/${this.name}.ts`), code);
  }

  getUseModels() {
    return [...new Set([
      ...this.requestBodys.map(o => o.type),
      ...this.params.map(o => o.type === 'obj' ? o.valueType : null),
      ['array', 'obj'].includes(this.responseBodyType.type) ? this.responseBodyType.valueType : null,
    ])]
  }
}

module.exports = { ServiceGenerate }