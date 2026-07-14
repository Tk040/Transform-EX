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

//选择图层
function selectLayerAct(layerID) {
  return {
    "_obj": "select",
    "_target": [{
      "_ref": "layer",
      "_id": layerID
    }],
    "makeVisible": false,
  }

}

//多选图层
function mutiSelectLayerAct(layerIDs) {
  return layerIDs.map((layerID, index) => {
    const selectAct = {
      "_obj": "select",
      "_target": [{
        "_ref": "layer",
        "_id": layerID
      }],
      "makeVisible": false
    }
    if (index > 0) {
      selectAct.selectionModifier = {
        "_enum": "selectionModifierType",
        "_value": "addToSelection"
      }
    }
    return selectAct
  })
}

async function getAllLayers() {
  const res0 = await action.batchPlay(getAllLayerAct, {});
  return res0[0].list
}

async function getTargetLayersIDs() {
  const res0 = await action.batchPlay(getTargetLayerAct, {});
  return res0[0].targetLayersIDs;
}

//获取所有图层,1为普通图层,7为组层
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

//#region 视频时间轴特有

//获取目前时间线时间
const getTimeAct = {
  "_obj": "get",
  "_target": [
    { "_property": "time", "_ref": "property" },
    { "_ref": "timeline" }
  ]
}

//设置目前时间轴
function setTimeAct(time) {
  return {
    "_obj": "set",
    "_target": [{ "_property": "time", "_ref": "property" }, { "_ref": "timeline" }],
    "to": time
  }
}

//测试偏移量
const testFrame = 54000
//用于获取图层结束位置
const getEndPosAct = [
  { "_obj": "moveOutTime", "timeOffset": { "_obj": "timecode", "frame": testFrame } },
  { "_obj": "set", "_target": [{ "_property": "time", "_ref": "property" }, { "_ref": "timeline" }], "to": { "_obj": "timecode", "minutes": 60 } },
  { "_obj": "moveOutTime", "timeOffset": { "_obj": "timecode", "frame": -testFrame } }
]

//移动当前选择图层时间位置
function moveLayerTimeAct(frameOffset) {
  return {
    "_obj": "moveAllTime",
    "timeOffset": { "_obj": "timecode", "frame": frameOffset }
  }
}

async function getTimelineTime() {
  const result = await action.batchPlay([getTimeAct], {})

  return result[0].time
}

//检测视频时间轴是否存在
async function checkTimeLine() {
  let time = await getTimelineTime()
  let r = await action.batchPlay([setTimeAct(time)], {})

  if (r[0].result == undefined) {
    return true
  }

  return false
}

//timecode完整时间转frame时间
function timeToFrame(time) {
  const frame = time.frame ?? 0
  const sec = time.seconds ?? 0
  const minu = time.minutes ?? 0
  const frameRate = time.frameRate ?? 0

  return Math.round(frame + (sec + minu * 60) * frameRate)
}

//获取每个图层最后一个有效帧
async function findLayerEndFrames(layersIDs) {
  const getPosAct = []

  for (let layerId of layersIDs) {
    getPosAct.push(
      selectLayerAct(layerId),
      ...getEndPosAct)
  }

  const result = await action.batchPlay(getPosAct, {})
  const endFramesByLayer = new Map()


  for (let i = 0; i < layersIDs.length; i++) {
    const setTimeResult = result[i * 4 + 2]

    endFramesByLayer.set(layersIDs[i], timeToFrame(setTimeResult.to) - testFrame)
  }

  return endFramesByLayer
}

//#endregion

async function freeTransformEX(executionContext) {

  const hostControl = executionContext.hostControl;
  //暂停记录
  const suspensionID = await hostControl.suspendHistory({
    documentID: app.activeDocument.id,
    name: translate("history", {}, locale)
  });

  const allLayers = await getAllLayers();
  const layersIDs = await getSelectedLayersIDs([1])

  if (layersIDs.length == 0) {
    await hostControl.resumeHistory(suspensionID, false);
    return
  }

  let existed = await checkTimeLine()
  if (existed) {
    //初始时间轴时间
    const originTime = await getTimelineTime()

    const layerEndMap = await findLayerEndFrames(layersIDs, originTime)

    let maxFrame = Math.max(...layerEndMap.values())

    console.log(maxFrame)

    let moveAct = []
    //对齐所有图层
    for (let i = 0; i < layersIDs.length; i++) {
      moveAct.push(selectLayerAct(layersIDs[i]),
        moveLayerTimeAct(maxFrame - layerEndMap.get(layersIDs[i])))
    }

    //恢复多选状态
    moveAct.push(...mutiSelectLayerAct(layersIDs))
    //移动指针
    moveAct.push(setTimeAct({ "_obj": "timecode", "frame": maxFrame }))
    await action.batchPlay(moveAct, {})

    code = await normalTranform(allLayers, layersIDs)

    if (code < 0) {
      //回退记录
      await hostControl.resumeHistory(suspensionID, false);
      return
    }

    moveAct.length = 0
    //还原所有图层
    for (let i = 0; i < layersIDs.length; i++) {
      moveAct.push(selectLayerAct(layersIDs[i]),
        moveLayerTimeAct(-(maxFrame - layerEndMap.get(layersIDs[i]))))
    }
    moveAct.push(setTimeAct(originTime))

    let r = await action.batchPlay(moveAct, {})

    console.log(r);

    await hostControl.resumeHistory(suspensionID);
  }
  else {
    let code = await normalTranform(allLayers, layersIDs)

    if (code < 0) {
      //回退记录
      await hostControl.resumeHistory(suspensionID, false);
      return
    }

    await hostControl.resumeHistory(suspensionID);
  }

}

//普通的图层的变换
async function normalTranform(allLayers, layersIDs) {

  //可用普通变换的情况
  if (layersIDs.length <= 1 || !await hasSelection()) {
    let r = await core.performMenuCommand({ commandID: 2207 });
    if (available == true && userCancelled == false) {
      return 0
    }
    else {
      return -1
    }
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
      "_obj": "show",
      "null": targetLayersIDs
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

  //记录变换信息
  let transformData
  const listener = (event, descriptor) => {
    transformData = descriptor;
  }
  await action.addNotificationListener(["transform"], listener)

  //执行原生变换
  console.log(await action.batchPlay(act1, { immediateRedraw: true }));
  const performResult = await core.performMenuCommand({ commandID: 2207 });

  //console.log(transformData)
  await action.removeNotificationListener(["transform"], listener)

  if (performResult.available == false || performResult.userCancelled == true) {
    return -1;
  }

  let result22 = await action.batchPlay([{
    "_obj": "transform",
    _target: [
      { _ref: "layer", _enum: "ordinal", _value: "targetEnum" },
    ],
    ...transformData
  }], {})

  console.log(result22)

  //暂存盘已满报错
  if (result22[0].result != undefined && result22[0].result < 0) {
    await core.showAlert({ message: result22[0].message });
    return -1
  }


  //执行自定义变换
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

    act3.push(
      selectLayerAct(layerId),
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
        ...transformData
      }
    );
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
    //console.log(result)
    for (let i = 0; i < result.length; i++) {
      if (result[i].result != undefined && result[i].result == -25010) {
        //console.log(result[i])
        await core.showAlert({ message: result[i].message });
        return -1
      }
    }
  }
  else {
    while (act3.length !== 0) {
      result = await action.batchPlay(act3, {});

      for (let i = 0; i < result.length; i++) {

        if (result[i].result != undefined && result[i].result == -25010) {
          await core.showAlert({ message: result[i].message });
          return -1
        }
      }
      //无视报错继续执行剩余部分
      act3.splice(0, result.length);
    }
  }

  //end = performance.now()
  //console.log("用时"+(end-start)+"毫秒");
  //恢复记录

  return 0;
}

async function prepareTimelineTrans() {

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
async function changeCheckbox() {
  let checked = document.getElementById("tranform_invisible_checkbox").checked
  includeInvisible = checked
  localStorage.setItem("tranformInvisibleChecked", checked)
}

async function execute() {
  await core.executeAsModal(freeTransformEX, { "commandName": "变换命令", interactive: true })
}

async function actionListener(event, descriptor) {
  console.log(event)
  console.log(descriptor)
}

function init() {
  changePage()
  //本地化文字
  document.getElementById("layer_info").innerHTML = translate("layer_info", {}, locale)
  document.getElementById("layer_count").innerHTML = translate("no_layers", {}, locale)
  document.getElementById("button_transform").innerHTML = translate("transform_button", {}, locale)
  const checkbox = document.getElementById("tranform_invisible_checkbox")
  checkbox.innerHTML = translate("tranform_invisible_layers", {}, locale)
  //赋值变量
  checkbox.checked = localStorage.getItem("tranformInvisibleChecked") === "true"
  includeInvisible = checkbox.checked
  //添加监听器
  action.addNotificationListener(['open', 'select', 'selectNoLayers'], changePage);
  //action.addNotificationListener(["all"], actionListener)
  document.getElementById("button_transform").addEventListener("click", execute);
  document.getElementById("tranform_invisible_checkbox").addEventListener("change", changeCheckbox);
}

init()