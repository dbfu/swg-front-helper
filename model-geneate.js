const { join } = require('path');
const fs = require('fs');
const babel = require('@babel/core');
const t = require('@babel/types');
const generate = require('@babel/generator').default;
const { getTypeBySchema } = require('./utils');


class ModelGenerate {
  schemas = {};
  useModels = [];
  modelAsts = [];
  allModels = [];

  constructor(filePath) {
    fs.mkdirSync(filePath, { recursive: true });
    this.filePath = filePath;
  }

  getUseModels(models) {
    return Object.keys(this.schemas)
      .filter(key => models.includes(key))
      .map(key => {
        const useModels = [];

        Object.keys(this.schemas[key]?.properties || {}).forEach(propKey => {
          const item = this.schemas[key]?.properties[propKey];
          if (item.type === 'array') {
            const type = getTypeBySchema(item.items.$ref);
            useModels.push(type);
          } else if (item.type === 'object') {
            const type = getTypeBySchema(item.items.$ref);
            useModels.push(type);
          }
        });

        return ({
          name: key,
          models: this.getUseModels(useModels),
          filePath: key.split('').map((v, index) => index === 0 ? v.toLowerCase() : v).join(''),
        });
      })
  }

  generate(useModels) {
    useModels.forEach(item => {
      const key = item.name;
      const models = item.models;
      const filePath = item.filePath;
      if (Object.keys(this.schemas[key]?.properties || {}).length) {
        this.generateModel(key, this.schemas[key]?.properties, models, filePath);
      } else {
        this.generateDefaultModel(key, filePath);
      }

      this.allModels.push({ name: key, filePath });

      this.generate(item.models);
    })
  }

  generateModel(modelName, properties, models, filePath) {
    const ast = t.exportNamedDeclaration(
      t.interfaceDeclaration(
        t.identifier(modelName),
        null,
        null,
        t.objectTypeAnnotation(
          this.generateProps(properties)
        ),
      )
    )

    const importCodes = [];
    if (models.length) {
      const importCodeAsts = models.map(item => {
        return t.importDeclaration(
          [t.importSpecifier(
            t.identifier(item.name),
            t.identifier(item.name),
          )],
          t.stringLiteral(
            `./${item.filePath}`
          )
        )
      })

      importCodes.push(...importCodeAsts.map(ast => generate(ast).code))
    }

    fs.writeFileSync(join(this.filePath, `${filePath}.ts`), [...importCodes, generate(ast).code].join('\n\n'));
  }

  generateProps(properties) {
    return Object.keys(properties).map(k => {
      const item = properties[k];
      let propType;

      if (item.type === 'array') {
        const type = getTypeBySchema(item.items.$ref);
        propType = t.arrayTypeAnnotation(
          t.genericTypeAnnotation(
            t.identifier(type)
          )
        )
      } else if (item.type === 'object') {
        const type = getTypeBySchema(item.items.$ref);
        propType = t.genericTypeAnnotation(
          t.identifier(type)
        )
      } else {
        propType = t.genericTypeAnnotation(
          t.identifier(item.type)
        )
      }
      return t.objectTypeProperty(
        t.identifier(k),
        propType
      );
    })
  }

  generateDefaultModel(modelName, filePath) {
    const ast = t.exportNamedDeclaration(
      t.interfaceDeclaration(
        t.identifier(modelName),
        null,
        null,
        t.objectTypeAnnotation(
          [],
          [
            t.objectTypeIndexer(
              t.identifier("k"),
              t.stringTypeAnnotation(),
              t.anyTypeAnnotation(),
            )
          ]
        )
      )
    )
    fs.writeFileSync(join(this.filePath, `${filePath}.ts`), [generate(ast).code].join('\n\n'), {});
  }

  generateIndexFile() {
    let body = [];
    if (fs.existsSync(join(`${this.filePath}`, 'index.ts'))) {
      const indexFileContext = fs.readFileSync(join(`${this.filePath}`, 'index.ts')).toString();
    
      body = babel.parse(
        indexFileContext,
        {
          filename: 'index.ts',
        },
      ).program.body;
    }

    this.allModels.forEach(item => {
      const ast = t.exportNamedDeclaration(
        null,
        [
          t.exportSpecifier(
            t.identifier(
              item.name,
            ),
            t.identifier(
              item.name,
            )
          )
        ],
        t.stringLiteral(
          `./${item.filePath}`
        )
      );

      const index = body.findIndex(ast => {
        return `./${item.filePath}` === ast.source.value;
      })

      if (index >= 0) {
        body[index] = ast;
      } else {
        body.push(ast);
      }
    })


    fs.writeFileSync(join(`${this.filePath}`, 'index.ts'), generate(t.program(body)).code);
  }

}

module.exports = { ModelGenerate };