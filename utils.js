function getTypeBySchema(schema) {
  return schema.split('/').pop();
}

function getNameByType(type) {
  return type.split('').map((v, index) => index === 0 ? v.toLowerCase() : v).join('')
}

module.exports = { getTypeBySchema, getNameByType };