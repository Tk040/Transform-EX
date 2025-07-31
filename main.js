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
    transform_button: "Multi-Transform",
    tranform_invisible_layers: "Tranform invisible layers"
  },
  "zh_CN": {
    history: "多选变换",
    layer_info: "图层信息",
    no_layers: "未选择图层",
    one_layer: "已选择#{count}个图层",
    many_layers: "已选择#{count}个图层",
    transform_button: "多选变换",
    tranform_invisible_layers: "变换不可见图层"
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
//各种组件
const { app, core, action } = require('photoshop');
const host = require('uxp').host;
const locale = host.uiLocale;
const version = compareVersion(host.version, "24.6.0") >= 0 ? "new" : "old";
//属性
let includeInvisible;


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
  extendedReference: [["name", "layerID", "layerKind", "visible"], { _obj: "layer", index: 0, count: -1 }],
  options: {
    failOnMissingProperty: false,
    failOnMissingElement: false
  }
}]
const getTargetLayerAct = [{
  _obj: "get",
  _target: [{ _property: "targetLayersIDs" }, { _ref: "document", _enum: "ordinal", _value: "targetEnum" }]
}]
async function getAllLayers() {
  const res0 = await action.batchPlay(getAllLayerAct, {});
  return res0[0].list
}
async function getTargetLayersIDs() {
  const res0 = await action.batchPlay(getTargetLayerAct, {});
  return res0[0].targetLayersIDs;
}
//获取所有图层
async function getSelectedLayersIDs(kindArray = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) {

  const layerMap = new Map()
  const allLayers = await getAllLayers();
  const targetLayersIDs = await getTargetLayersIDs();
  const layerSet = new Set();

  for (let i = 0; i < allLayers.length; i++) {
    layerMap.set(allLayers[i].layerID, i)
  }
  //组树结构处理
  for (layer of targetLayersIDs) {
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
  const allLayers = await getAllLayers();
  const layersIDs = await getSelectedLayersIDs([1]);
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
  if (layersIDs.length <= 1 || !await hasSelection()) {
    await core.performMenuCommand({ commandID: 2207 });
    await hostControl.resumeHistory(suspensionID);
    return;
  }
  const targetLayersIDs = layersIDs.filter(id => allLayers.find(layer => layer.layerID === id).visible || includeInvisible).map(layerId => ({
    "_id": layerId,
    "_ref": "layer"
  }))
  const invisibleLayers = allLayers.filter(l => !l.visible).map(layer => ({
    "_id": layer.layerID,
    "_ref": "layer"
  }));

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
      "_target": targetLayersIDs,
      "version": 5
    },
    {
      "_obj": "mergeLayersNew"
    },
    // 隐藏图层
    {
      "_obj": "hide",
      "null": targetLayersIDs
    }
  ];

  //执行操作
  await action.batchPlay(act1, { immediateRedraw: true });
  const performResult = await core.performMenuCommand({ commandID: 2207 });

  if (performResult.available == false || performResult.userCancelled == true) {
    //回退记录
    await hostControl.resumeHistory(suspensionID, false);
    return;
  }

  console.log(await action.batchPlay([{
    "_obj": "transform",
    _target: [
      { _ref: "layer", _enum: "ordinal", _value: "targetEnum" },
    ],
    "lastTransform": true
  }], {}))

  //构造最终变换动作串
  let act3 = [];
  //起头
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
      "null": targetLayersIDs
    })
  for (let layerId of layersIDs) {

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
        "lastTransform": true
      }
    ]);
  }
  //收尾
  act3.push({
    _obj: "delete",
    _target: [
      {
        _ref: "channel",
        _name: "selec临时选区tion"
      }
    ]
  },
    {
      "_obj": "hide",
      "null": invisibleLayers
    })
  //start = performance.now()
  let result;
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
  //console.log("用时"+(end-start)+"毫秒");
  //恢复记录
  await hostControl.resumeHistory(suspensionID);
  return result;
}

async function changePage() {
  const allLayers = await getSelectedLayersIDs()
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
async function changeCheckbox()
{
  let checked= document.getElementById("tranform_invisible_checkbox").checked
  includeInvisible=checked
  localStorage.setItem("tranformInvisibleChecked", checked)
}

async function execute() {
  await core.executeAsModal(freeTransformEX, { "commandName": "变换命令", interactive: true })
}

function init() {
  changePage()
  //本地化文字
  document.getElementById("layer_info").innerHTML = translate("layer_info", {}, locale)
  document.getElementById("layer_count").innerHTML = translate("no_layers", {}, locale)
  document.getElementById("button_transform").innerHTML = translate("transform_button", {}, locale)
  const checkbox=document.getElementById("tranform_invisible_checkbox")
  checkbox.innerHTML = translate("tranform_invisible_layers", {}, locale)
  checkbox.checked=localStorage.getItem("tranformInvisibleChecked")==="true"
  //添加监听器
  action.addNotificationListener(['open', 'select', 'selectNoLayers'], changePage);
  document.getElementById("button_transform").addEventListener("click", execute);
  document.getElementById("tranform_invisible_checkbox").addEventListener("change", changeCheckbox);
}

init()