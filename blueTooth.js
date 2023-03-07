// 蓝牙连接类，结合发布订阅者进行操作

// 2023年03月07日封装

/*
  @Param filters 筛选条件
  @Param serverID 默认连接服务
  @Param readID 默认读取监听特征
  @Param sendID 默认写入特征
  @Param disconnected 断线执行函数
  @Param handleNotifications 监听函数里执行
*/

// 记得根据自己的通信协议修改条件
class BlueTooth {
  // 初始化蓝牙对象 基础数据
  constructor({
    filters,
    serverID,
    readID,
    sendID,
    disconnected,
    handleNotifications,
  }) {
    this.filters = filters;
    this.serverID = serverID;
    this.readID = readID;
    this.sendID = sendID;
    this.disconnected = disconnected;
    this.handleNotifications = handleNotifications;
    // 消息储存数组
    this.recv_list = [];
    // 创建订阅者
    this.deps = new Dep();
    // 创建代理
    this.$recv_list = this.proxyList();
  }

  // 监听收到的命令
  proxyList() {
    let _this = this;
    return new Proxy(this.recv_list, {
      set(target, prop, value) {
        value += "";
        // 通知订阅者干活

        /** 记得修改这里的通知条件 */
        _this.deps.notify(value.slice(4, 8), value);

        return Reflect.set(...arguments);
      },
    });
  }

  // 开始连接
  onConnect() {
    return new Promise((resolve, reject) => {
      navigator.bluetooth
        .requestDevice({ ...this.filters })
        .then((device) => {
          this.device = device;
          // 连接蓝牙并监听断开
          device.addEventListener(
            "gattserverdisconnected",
            this.onDisconnected
          );
          return device.gatt.connect();
        })
        .then((server) => {
          // 储存server服务
          this.server = server;
          resolve();
        })
        .catch((err) => {
          console.error("connect error: ", err);
          reject()
        });
    });
  }

  // 连接服务
  onServer(serverID = this.serverID) {
    if (!this.server) {
      console.warn("蓝牙未连接");
      return;
    }
    return new Promise((resolve, reject) => {
      this.server
        .getPrimaryService(serverID)
        .then((service) => {
          // 存储service特征
          this.service = service;
          resolve();
        })
        .catch((err) => {
          console.error("server error: ", err);
          reject();
        });
    });
  }

  // 监听特征
  onRead(serviceID = this.readID) {
    if (!this.service) {
      console.warn("未连接蓝牙服务");
      return;
    }
    return new Promise((resolve, reject) => {
      this.service
        .getCharacteristic(serviceID)
        .then((characteristic) => {
          return characteristic.startNotifications();
        })
        .then((characteristic) => {
          // 改变this指向，不然会指向 事件对象
          characteristic.addEventListener(
            "characteristicvaluechanged",
            this.onHandleNotifications.bind(this)
          );
        })
        .then(() => {
          resolve();
        })
        .catch((err) => {
          console.error("read error: ", err);
          reject();
        });
    });
  }

  // 写入特征
  onSend(str, sendID = this.sendID) {
    if (!this.service) {
      console.warn("未连接蓝牙服务");
      return;
    }
    return new Promise((resolve, reject) => {
      this.service
        .getCharacteristic(sendID)
        .then((characteristic) => {
          characteristic.writeValue(new Uint8Array(sHEX(str)));
        })
        .then(() => {
          setTimeout(() => {
            resolve();
          }, 0);
        })
        .catch((err) => {
          console.error("send error: ", err);
          reject()
        });
    });
  }

  // 写入特征 并等待消息返回
  /* 
    @Param str 发送的字符串(十进制)
    @Param time 超时时间
    @Param sendID 发送的特征名称
  */
  SendInfoFn(str, time, sendID) {
    if (!this.service) {
      console.warn("未连接蓝牙服务");
      return;
    }
    return new Promise((resolve, reject) => {
      this.service
        .getCharacteristic(sendID)
        .then((characteristic) => {
          // 添加订阅者，利用回调函数来传参
          this.deps.addDep(
            str.slice(4, 8),
            new Watch(function (str) {
              resolve(str);
            })
          );
          // 规定时间内没有返回值就返回错误
          setTimeout(() => {
            console.warn("时间到喽");
            reject();
          }, time);
          characteristic.writeValue(new Uint8Array(sHEX(str)));
        })
        .catch((err) => {
          console.error("send error: ", err);
          reject();
        });
    });
  }

  // 循环判断，判断是否读取成功
  /* 
    @Param str 发送的字符串(十进制)
    @Param numbers 错误次数
    @Param time 超时时间
    @Param sendID 发送的特征名称
  */
  async onSendInfo(str, numbers = 3, time = 3000, sendID = this.sendID) {
    let num = 0;
    // 循环判断错误次数
    while (num < numbers) {
      // 获取失败之后增加错误次数，正确就抛出正确结果
      try {
        console.warn("开始尝试 ", num);
        let string = await this.SendInfoFn(str, time, sendID);
        return new Promise((resolve) => {
          resolve(string);
        });
      } catch {
        num++;
      }
    }
    // 超过错误次数之后返回错误
    return new Promise((resolve, reject) => {
      reject();
    });
  }

  // 手动断开连接
  clearConnect() {
    if (!this.device) {
      console.warn("蓝牙未连接");
      return;
    }
    this.device.gatt.disconnected();
  }

  // 断开连接函数
  // 考虑到手动断开也会触发就暂时不写重连了（加判断后可以实现）
  onDisconnected() {
    // 先执行用户传进来的断线函数
    if (this.disconnected) {
      this.disconnected();
    }
    this.device = null;
    this.server = null;
    this.service = null;
    this.dep = null;
    console.warn("蓝牙已断开");
  }

  // 消息处理函数
  onHandleNotifications(event) {
    // 解析
    let str = hString(event.target.value);
    // 接收到的消息就push进去
    this.$recv_list.push(str);
    if (this.handleNotifications) {
      this.handleNotifications(str);
    }
  }
}

// 发布者

class Dep {
  constructor() {
    this.deps = {};
  }

  /* 
    添加订阅者
    @Param key 订阅名称
    @Param dep 订阅者
  */
  addDep(key, dep) {
    this.deps[key] = dep;
  }

  /* 
    通知订阅者起床干活
    @Param key 订阅名称
    @Param str 数据
  */
  notify(key, str) {
    if (this.deps.hasOwnProperty(key)) {
      this.deps[key].updata(str);
    }
  }
}

// 订阅者

class Watch {
  constructor(callBack) {
    this.callBack = callBack;
  }

  updata(str) {
    this.callBack(str);
  }
}

// 数据解析函数

function hString(value) {
  let str = "";
  for (var i = 0; i < value.buffer.byteLength; i++) {
    str += ("00" + value.getUint8(i).toString(16)).slice(-2).toUpperCase();
  }
  return str;
}

function sHEX(str) {
  let arr = [];
  Number(str);
  for (let i = 0; i < str.length; i += 2) {
    arr.push(Number("0x" + str.slice(i, i + 2)));
  }
  return arr;
}

// module 导出方法
export default { BlueTooth };
