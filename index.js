#!/usr/bin/env node

const { join } = require('path');
const request = require('request');
const ora = require('ora');
 
const { ModelGenerate } = require('./model-geneate');
const { ServiceGenerate } = require('./service-generate');

if (process.argv.length > 3) {
  console.log('只能有一个参数');
  process.exit();
}

let moduleName;
if (process.argv.length > 2) {
  moduleName = process.argv.pop();
}

const spinner = ora('生成文件中...').start();

request.get('http://127.0.0.1:7001/swagger-ui/index.json', (error, _, body) => {

  if (error) {
    console.log('获取数据失败');
    return;
  }

  const modelDirPath = join(process.cwd(), 'src', 'interface', 'dto');
  const serviceDirPath = join(process.cwd(), 'src', 'service');

  const data = JSON.parse(body);
  const { components } = data;

  const serviceGenerate = new ServiceGenerate(serviceDirPath);
  serviceGenerate.data = data;
  serviceGenerate.moduleName = moduleName;
  serviceGenerate.filePath = serviceDirPath;
  serviceGenerate.modelPath = modelDirPath;
  serviceGenerate.generate();

  const { schemas } = components || {};
  const modelGenerate = new ModelGenerate(modelDirPath);
  modelGenerate.schemas = schemas;
  modelGenerate.useModels = modelGenerate.getUseModels(serviceGenerate.useModels);
  modelGenerate.generate(modelGenerate.useModels);
  modelGenerate.generateIndexFile();

  spinner.stop();
});







