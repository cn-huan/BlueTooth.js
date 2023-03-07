import { BlueTooth } from "./blueTooth";

let ble;

document.getElementById("open").onclick = async function () {
  // 初始化，填上自己的参数
  ble = new BlueTooth(
    {},
    "serverID",
    "readID",
    "sendID",
    () => {},
    () => {}
  );

  try {
    // 开始连接
    await ble.onConnect();
    console.log("连接完成");

    await ble.onServer();
    console.log("服务连接完成");

    await ble.onRead();
    console.log("监听完成");
  } catch (err) {
    console.error("error: ", err);
  }
};

document.getElementById("open").onclick = async function () {
  try {
    let str = await ble.onSendInfo("0B03030303CC");
    console.log(str);
  } catch (err) {
    console.error("error: ", err);
  }
};
