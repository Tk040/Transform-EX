const { entrypoints } = require("uxp");

transformEX = () => {
  execute()
}

entrypoints.setup({
  commands: {
    transformEX,
  },
  panels: {
    vanilla: {
      show(node) {
      }
    }
  }
});

const str = {
  "en_US": {
    history: "Multi-Transform",
    layer_info: "Layer Info",
    no_layers: "No layers",
    one_layer: "1 layer selected",
    many_layers: "#{count} layers selected",
    transform_button: "Multi-Transform"
  },
  "zh_CN": {
    history: "多选变换",
    layer_info: "图层信息",
    no_layers: "未选择图层",
    one_layer: "已选择#{count}个图层",
    many_layers: "已选择#{count}个图层",
    transform_button: "多选变换"
  }
}

function compareVersion(v1, v2) {
  const arr1 = v1.split('.').map(Number);
  const arr2 = v2.split('.').map(Number);
  const len = Math.max(arr1.length, arr2.length);

  for (let i = 0; i < len; i++) {
    const num1 = arr1[i] || 0;
    const num2 = arr2[i] || 0;
    if (num1 > num2) return 1;   // v1 > v2
    if (num1 < num2) return -1;  // v1 < v2
  }
  return 0;
}

const { app, core, action } = require('photoshop');
const host = require('uxp').host;
const locale = host.uiLocale;
const version =  compareVersion(host.version, "24.6.0")>=0?"new":"old";


function translate(key, variables = {}, locale) {
  let template = str[locale][key] || str['en_US'][key] || key;
  Object.keys(variables).forEach(k => {
    template = template.replace(`#{${k}}`, variables[k]);
  });
  return template;
}
//选区检测
async function hasSelection() {
  act0 = [{
    _obj: "get",
    _target: [
      { _property: "selection" },
      { _ref: "document", _enum: "ordinal", _value: "targetEnum" },
    ],
    _options: { dialogOptions: "dontDisplay" },
  }]
  const result = await action.batchPlay(act0, {});
  if (result[0].selection) {
    return true;
  }
  else {
    return false;
  }
}
//命令集
const getAllLayerAct = [{
  _obj: "multiGet",
  _target: {
    _ref: [
      { _ref: "document", _enum: "ordinal" }
    ]
  },
  extendedReference: [["name", "layerID", "layerKind"], { _obj: "layer", index: 0, count: -1 }],
  options: {
    failOnMissingProperty: false,
    failOnMissingElement: false
  }
}]
const getTargetLayerAct = [{
  _obj: "get",
  _target: [{ _property: "targetLayersIDs" }, { _ref: "document", _enum: "ordinal", _value: "targetEnum" }]
}]
//获取所有图层
async function getSelectedLayers(kindArray = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) {

  const res0 = await action.batchPlay(getAllLayerAct, {});
  const res1 = await action.batchPlay(getTargetLayerAct, {});
  const layerMap = new Map()
  const allLayers = res0[0].list;
  const targetLayers = res1[0].targetLayersIDs;
  const layerSet = new Set();

  for (let i = 0; i < allLayers.length; i++) {
    layerMap.set(allLayers[i].layerID, i)
  }

  for (layer of targetLayers) {
    let index = layerMap.get(layer._id);
    if (kindArray.includes(allLayers[index].layerKind)) {
      layerSet.add(layer._id)
    }
    else if (allLayers[index].layerKind === 7) {
      let stack = []
      stack.push(1);

      index--;
      while (stack.length !== 0) {
        if (allLayers[index].layerKind === 7) {
          stack.push(1)
        }
        else if (allLayers[index].layerKind === 13) {
          stack.pop()
        }
        else {
          if (kindArray.includes(allLayers[index].layerKind)) {
            layerSet.add(allLayers[index].layerID)
          }
        }
        index--;
      }
    }
  }

  return [...layerSet];
}

async function freeTransformEX(executionContext) {

  let hostControl = executionContext.hostControl;
  //暂停记录
  let suspensionID = await hostControl.suspendHistory({
    documentID: app.activeDocument.id,
    name: translate("history", {}, locale)
  });

  const layers = await getSelectedLayers([1]);
  let act2 = [
    {
      _obj: "transform",
      "_target": [
        {
          "_enum": "ordinal",
          "_ref": "layer",
          "_value": "targetEnum"
        }
      ],
      _options: { dialogOptions: "display" }
    }
  ]
  //可用普通变换的情况
  if (layers.length <= 1 || !await hasSelection()) {
    await action.batchPlay(act2, {});
    await hostControl.resumeHistory(suspensionID);
    return;
  }

  let targetLayers = layers.map(layerId => ({
    "_id": layerId,
    "_ref": "layer"
  }))
  let act1 = [
    // 复制 选区
    {
      "_obj": "duplicate",
      "_target": [
        {
          "_property": "selection",
          "_ref": "channel"
        }
      ],
      "name": "selec临时选区tion"
    },
    {
      "_obj": "duplicate",
      "_target": targetLayers,
      "version": 5
    },
    {
      "_obj": "mergeLayersNew"
    },
    // 隐藏图层
    {
      "_obj": "hide",
      "null": targetLayers
    }
  ];

  //执行操作
  await action.batchPlay(act1, { immediateRedraw: true });
  let transformData = await action.batchPlay(act2, {})

  if (transformData[0].result === -128) {
    //回退记录
    await hostControl.resumeHistory(suspensionID, false);
    return;
  }

  //构造变换动作串
  let act3 = [];

  act3.push(
    // 设置 选区
    {
      "_obj": "set",
      "_target": [
        {
          "_property": "selection",
          "_ref": "channel"
        }
      ],
      "to": {
        "_enum": "ordinal",
        "_value": "none"
      }
    },
    // 删除 当前图层
    {
      "_obj": "delete",
      "_target": [
        {
          "_enum": "ordinal",
          "_ref": "layer",
          "_value": "targetEnum"
        }
      ]
    },
    {
      "_obj": "show",
      "null": targetLayers
    })
  for (let layerId of layers) {

    act3.push(...[
      //选择图层
      {
        "_obj": "select",
        "_target": [{
          "_ref": "layer",
          "_id": layerId
        }],
        "makeVisible": false,
      },
      //设置选区
      {
        "_obj": "set",
        "_target": [
          {
            "_property": "selection",
            "_ref": "channel"
          }
        ],
        "to": {
          "_name": "selec临时选区tion",
          "_ref": "channel"
        }
      },
      // 变换 当前图层
      {
        "_obj": "transform",
        ...transformData[0]
      }
    ]);
  }
  act3.push({
    _obj: "delete",
    _target: [
      {
        _ref: "channel",
        _name: "selec临时选区tion"
      }
    ]
  })
  //console.log(version)
  //start = performance.now()
  if (version === "new") {
    result = await action.batchPlay(act3, { continueOnError: true });
  }
  else {
    while (act3.length !== 0) {
      result = await action.batchPlay(act3, {});
      act3.splice(0, result.length);
    }
  }
  //end = performance.now()
  //console.log("用时" + (end - start) + "毫秒");
  //恢复记录
  await hostControl.resumeHistory(suspensionID);
  return result;
}

async function changePage() {
  const allLayers = await getSelectedLayers()
  let key;
  if (allLayers.length === 0) {
    key = "no_layers"
  }
  else if (allLayers.length === 1) {
    key = "one_layer"
  }
  else {
    key = "many_layers"
  }
  document.getElementById("layer_count").innerHTML = `
        <ul>${translate(key, { count: allLayers.length }, locale)}</ul>`;
}

async function execute() {
  await core.executeAsModal(freeTransformEX, { "commandName": "变换命令", interactive: true })
}

function init() {
  changePage()
  document.getElementById("layer_info").innerHTML = translate("layer_info", {}, locale)
  document.getElementById("layer_count").innerHTML = translate("no_layers", {}, locale)
  document.getElementById("button_transform").innerHTML = translate("transform_button", {}, locale)
}

init()

action.addNotificationListener(['open', 'select', 'selectNoLayers'], changePage);
document.getElementById("button_transform").addEventListener("click", execute);