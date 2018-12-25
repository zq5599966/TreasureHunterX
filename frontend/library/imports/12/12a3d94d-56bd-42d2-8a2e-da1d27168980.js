"use strict";
cc._RF.push(module, '12a3dlNVr1C0oou2h0nFomA', 'Login');
// scripts/Login.js

'use strict';

var i18n = require('LanguageData');
i18n.init(window.language); // languageID should be equal to the one we input in New Language ID input field
cc.Class({
  extends: cc.Component,

  properties: {
    cavasNode: {
      default: null,
      type: cc.Node
    },
    backgroundNode: {
      default: null,
      type: cc.Node
    },
    interactiveControls: {
      default: null,
      type: cc.Node
    },
    phoneCountryCodeInput: {
      default: null,
      type: cc.Node
    },
    phoneNumberInput: {
      type: cc.Node,
      default: null
    },
    phoneNumberTips: {
      type: cc.Node,
      default: null
    },
    smsLoginCaptchaInput: {
      type: cc.Node,
      default: null
    },
    smsLoginCaptchaButton: {
      type: cc.Node,
      default: null
    },
    captchaTips: {
      type: cc.Node,
      default: null
    },
    loginButton: {
      type: cc.Node,
      default: null
    },
    smsWaitCountdownPrefab: {
      default: null,
      type: cc.Prefab
    },
    loadingPrefab: {
      default: null,
      type: cc.Prefab
    },
    wechatLoginButton: {
      default: null,
      type: cc.Button
    },
    wechatLoginTips: {
      default: null,
      type: cc.Label
    }
  },

  // LIFE-CYCLE CALLBACKS:

  onLoad: function onLoad() {
    var self = this;
    self.getRetCodeList();
    self.getRegexList();
    self.checkPhoneNumber = self.checkPhoneNumber.bind(self);
    self.checkIntAuthTokenExpire = self.checkIntAuthTokenExpire.bind(self);
    self.checkCaptcha = self.checkCaptcha.bind(self);
    self.onSMSCaptchaGetButtonClicked = self.onSMSCaptchaGetButtonClicked.bind(self);
    self.smsLoginCaptchaButton.on('click', self.onSMSCaptchaGetButtonClicked);

    self.loadingNode = cc.instantiate(this.loadingPrefab);
    self.smsGetCaptchaNode = self.smsLoginCaptchaButton.getChildByName('smsGetCaptcha');
    self.smsWaitCountdownNode = cc.instantiate(self.smsWaitCountdownPrefab);

    cc.loader.loadRes("pbfiles/room_downsync_frame", function (err, textAsset /* cc.TextAsset */) {
      if (err) {
        cc.error(err.message || err);
        return;
      }
      var protoRoot = new protobuf.Root();
      protobuf.parse(textAsset.text, protoRoot);
      window.RoomDownsyncFrame = protoRoot.lookupType("models.RoomDownsyncFrame");
      self.checkIntAuthTokenExpire().then(function () {
        var intAuthToken = JSON.parse(cc.sys.localStorage.selfPlayer).intAuthToken;
        self.useTokenLogin(intAuthToken);
      }, function () {
        // TODO: Handle expired intAuthToken appropriately.
        var code = self.getQueryVariable("code");
        if (code) {
          //TODO: 请求credentialsAuthToken api with code
          cc.log("Got the code: " + code);
          self.useWXCodeLogin(code);
        }
      });
    });
  },
  getRetCodeList: function getRetCodeList() {
    var self = this;
    self.retCodeDict = constants.RET_CODE;
  },
  getRegexList: function getRegexList() {
    var self = this;
    self.regexList = {
      EMAIL: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      PHONE: /^\+?[0-9]{8,14}$/,
      STREET_META: /^.{5,100}$/,
      LNG_LAT_TEXT: /^[0-9]+(\.[0-9]{4,6})$/,
      SEO_KEYWORD: /^.{2,50}$/,
      PASSWORD: /^.{6,50}$/,
      SMS_CAPTCHA_CODE: /^[0-9]{4}$/,
      ADMIN_HANDLE: /^.{4,50}$/
    };
  },
  onSMSCaptchaGetButtonClicked: function onSMSCaptchaGetButtonClicked(evt) {
    var timerEnable = true;
    var self = this;
    if (!self.checkPhoneNumber('getCaptcha')) {
      return;
    }
    NetworkUtils.ajax({
      url: backendAddress.PROTOCOL + '://' + backendAddress.HOST + ':' + backendAddress.PORT + constants.ROUTE_PATH.API + constants.ROUTE_PATH.PLAYER + constants.ROUTE_PATH.VERSION + constants.ROUTE_PATH.SMS_CAPTCHA + constants.ROUTE_PATH.GET,
      type: 'GET',
      data: {
        phoneCountryCode: self.phoneCountryCodeInput.getComponent(cc.EditBox).string,
        phoneNum: self.phoneNumberInput.getComponent(cc.EditBox).string
      },
      success: function success(res) {
        switch (res.ret) {
          case self.retCodeDict.OK:
            self.phoneNumberTips.getComponent(cc.Label).string = '';
            self.captchaTips.getComponent(cc.Label).string = '';
            break;
          case self.retCodeDict.DUPLICATED:
            self.phoneNumberTips.getComponent(cc.Label).string = constants.ALERT.TIP_LABEL.LOG_OUT;
            break;
          case self.retCodeDict.INCORRECT_PHONE_COUNTRY_CODE_OR_NUMBER:
            self.captchaTips.getComponent(cc.Label).string = i18n.t("login.tips.PHONE_ERR");
            break;
          case self.retCodeDict.IS_TEST_ACC:
            self.smsLoginCaptchaInput.getComponent(cc.EditBox).string = res.smsLoginCaptcha;
            self.captchaTips.getComponent(cc.Label).string = i18n.t("login.tips.TEST_USER");
            timerEnable = false;
            // clearInterval(self.countdownTimer);
            break;
          case self.retCodeDict.SMS_CAPTCHA_REQUESTED_TOO_FREQUENTLY:
            self.captchaTips.getComponent(cc.Label).string = i18n.t("login.tips.SMS_CAPTCHA_FREEQUENT_REQUIRE");
          default:
            break;
        }
        if (timerEnable) self.countdownTime(self);
      }
    });
  },
  countdownTime: function countdownTime(self) {
    self.smsLoginCaptchaButton.off('click', self.onSMSCaptchaGetButtonClicked);
    self.smsLoginCaptchaButton.removeChild(self.smsGetCaptchaNode);
    self.smsWaitCountdownNode.parent = self.smsLoginCaptchaButton;
    var total = 20; // Magic number
    self.countdownTimer = setInterval(function () {
      if (total === 0) {
        self.smsWaitCountdownNode.parent.removeChild(self.smsWaitCountdownNode);
        self.smsGetCaptchaNode.parent = self.smsLoginCaptchaButton;
        self.smsWaitCountdownNode.getChildByName('WaitTimeLabel').getComponent(cc.Label).string = 20;
        self.smsLoginCaptchaButton.on('click', self.onSMSCaptchaGetButtonClicked);
        clearInterval(self.countdownTimer);
      } else {
        total--;
        self.smsWaitCountdownNode.getChildByName('WaitTimeLabel').getComponent(cc.Label).string = total;
      }
    }, 1000);
  },
  checkIntAuthTokenExpire: function checkIntAuthTokenExpire() {
    return new Promise(function (resolve, reject) {
      if (!cc.sys.localStorage.selfPlayer) {
        reject();
        return;
      }
      var selfPlayer = JSON.parse(cc.sys.localStorage.selfPlayer);
      selfPlayer.intAuthToken && new Date().getTime() < selfPlayer.expiresAt ? resolve() : reject();
    });
  },
  checkPhoneNumber: function checkPhoneNumber(type) {
    var self = this;
    var phoneNumberRegexp = self.regexList.PHONE;
    var phoneNumberString = self.phoneNumberInput.getComponent(cc.EditBox).string;
    if (phoneNumberString) {
      return true;
      if (!phoneNumberRegexp.test(phoneNumberString)) {
        self.captchaTips.getComponent(cc.Label).string = i18n.t("login.tips.PHONE_ERR");
        return false;
      } else {
        return true;
      }
    } else {
      if (type === 'getCaptcha' || type === 'login') {
        self.captchaTips.getComponent(cc.Label).string = i18n.t("login.tips.PHONE_ERR");
      }
      return false;
    }
  },
  checkCaptcha: function checkCaptcha(type) {
    var self = this;
    var captchaRegexp = self.regexList.SMS_CAPTCHA_CODE;
    var captchaString = self.smsLoginCaptchaInput.getComponent(cc.EditBox).string;

    if (captchaString) {
      if (self.smsLoginCaptchaInput.getComponent(cc.EditBox).string.length !== 4 || !captchaRegexp.test(captchaString)) {
        self.captchaTips.getComponent(cc.Label).string = i18n.t("login.tips.CAPTCHA_ERR");
        return false;
      } else {
        return true;
      }
    } else {
      if (type === 'login') {
        self.captchaTips.getComponent(cc.Label).string = i18n.t("login.tips.CAPTCHA_ERR");
      }
      return false;
    }
  },
  useTokenLogin: function useTokenLogin(_intAuthToken) {
    var self = this;
    NetworkUtils.ajax({
      url: backendAddress.PROTOCOL + '://' + backendAddress.HOST + ':' + backendAddress.PORT + constants.ROUTE_PATH.API + constants.ROUTE_PATH.PLAYER + constants.ROUTE_PATH.VERSION + constants.ROUTE_PATH.INT_AUTH_TOKEN + constants.ROUTE_PATH.LOGIN,
      type: "POST",
      data: {
        intAuthToken: _intAuthToken
      },
      success: function success(resp) {
        self.onLoggedIn(resp);
      },
      error: function error(xhr, status, errMsg) {
        cc.log('Login attempt "useTokenLogin" failed, about to execute "clearBoundRoomIdInBothVolatileAndPersistentStorage".');
        window.clearBoundRoomIdInBothVolatileAndPersistentStorage();
      },
      timeout: function timeout() {
        self.enableInteractiveControls(true);
      }
    });
  },
  enableInteractiveControls: function enableInteractiveControls(enabled) {
    this.smsLoginCaptchaButton.getComponent(cc.Button).interactable = enabled;
    this.loginButton.getComponent(cc.Button).interactable = enabled;
    this.phoneCountryCodeInput.getComponent(cc.EditBox).enabled = enabled;
    this.phoneNumberInput.getComponent(cc.EditBox).enabled = enabled;
    this.smsLoginCaptchaInput.getComponent(cc.EditBox).enabled = enabled;
    if (enabled) {
      setVisible(this.interactiveControls);
    } else {
      setInvisible(this.interactiveControls);
    }
  },
  onLoginButtonClicked: function onLoginButtonClicked(evt) {
    var self = this;
    if (!self.checkPhoneNumber('login') || !self.checkCaptcha('login')) {
      return;
    }
    self.loginParams = {
      phoneCountryCode: self.phoneCountryCodeInput.getComponent(cc.EditBox).string,
      phoneNum: self.phoneNumberInput.getComponent(cc.EditBox).string,
      smsLoginCaptcha: self.smsLoginCaptchaInput.getComponent(cc.EditBox).string
    };
    self.enableInteractiveControls(false);

    NetworkUtils.ajax({
      url: backendAddress.PROTOCOL + '://' + backendAddress.HOST + ':' + backendAddress.PORT + constants.ROUTE_PATH.API + constants.ROUTE_PATH.PLAYER + constants.ROUTE_PATH.VERSION + constants.ROUTE_PATH.SMS_CAPTCHA + constants.ROUTE_PATH.LOGIN,
      type: "POST",
      data: self.loginParams,
      success: function success(resp) {
        self.onLoggedIn(resp);
      },
      error: function error(xhr, status, errMsg) {
        cc.log('Login attempt "onLoginButtonClicked" failed, about to execute "clearBoundRoomIdInBothVolatileAndPersistentStorage".');
        window.clearBoundRoomIdInBothVolatileAndPersistentStorage();
      },
      timeout: function timeout() {
        self.enableInteractiveControls(true);
      }
    });
  },
  onWechatLoggedIn: function onWechatLoggedIn(res) {
    var self = this;
    cc.log('OnLoggedIn ' + JSON.stringify(res) + '.');
    if (res.ret === self.retCodeDict.OK) {
      self.enableInteractiveControls(false);
      var date = Number(res.expiresAt);
      var selfPlayer = {
        expiresAt: date,
        playerId: res.playerId,
        intAuthToken: res.intAuthToken,
        displayName: res.displayName
      };
      cc.sys.localStorage.selfPlayer = JSON.stringify(selfPlayer);
      cc.log('cc.sys.localStorage.selfPlayer = ' + cc.sys.localStorage.selfPlayer);
      var qDict = {};
      if (null != cc.sys.localStorage.boundRoomId) {
        Object.assign(qDict, {
          expectedRoomId: cc.sys.localStorage.boundRoomId
        });
      }
      window.history.replaceState(qDict, null, window.location.pathname);
      self.useTokenLogin(res.intAuthToken);
    } else {
      cc.sys.localStorage.removeItem("selfPlayer");
      self.wechatLoginTips.string = constants.ALERT.TIP_LABEL.WECHAT_LOGIN_FAILS + ", errorCode = " + res.ret;
      window.history.replaceState({}, null, window.location.pathname);
    }
  },
  onLoggedIn: function onLoggedIn(res) {
    var self = this;
    cc.log('OnLoggedIn ' + JSON.stringify(res) + '.');
    if (res.ret === self.retCodeDict.OK) {
      self.enableInteractiveControls(false);
      var date = Number(res.expiresAt);
      var selfPlayer = {
        expiresAt: date,
        playerId: res.playerId,
        intAuthToken: res.intAuthToken,
        displayName: res.displayName
      };
      cc.sys.localStorage.selfPlayer = JSON.stringify(selfPlayer);
      cc.log('cc.sys.localStorage.selfPlayer = ' + cc.sys.localStorage.selfPlayer);
      window.initWxSdk = self.initWxSdk.bind(self);
      window.initWxSdk();
      if (self.countdownTimer) {
        clearInterval(self.countdownTimer);
      }
      var inputControls = self.backgroundNode.getChildByName("InteractiveControls");
      self.backgroundNode.removeChild(inputControls);
      safelyAddChild(self.backgroundNode, self.loadingNode);
      self.loadingNode.getChildByName('loadingSprite').runAction(cc.repeatForever(cc.rotateBy(1.0, 360)));
      cc.director.loadScene('default_map');
    } else {
      cc.sys.localStorage.removeItem("selfPlayer");
      self.enableInteractiveControls(true);
      switch (res.ret) {
        case self.retCodeDict.DUPLICATED:
          this.phoneNumberTips.getComponent(cc.Label).string = constants.ALERT.TIP_LABEL.LOG_OUT;
          break;
        case this.retCodeDict.TOKEN_EXPIRED:
          this.captchaTips.getComponent(cc.Label).string = constants.ALERT.TIP_LABEL.TOKEN_EXPIRED;
          break;
        case this.retCodeDict.SMS_CAPTCHA_NOT_MATCH:
          self.captchaTips.getComponent(cc.Label).string = i18n.t("login.tips.SMS_CAPTCHA_NOT_MATCH");
          break;
        case this.retCodeDict.INCORRECT_CAPTCHA:
          self.captchaTips.getComponent(cc.Label).string = i18n.t("login.tips.SMS_CAPTCHA_NOT_MATCH");
          break;
        case this.retCodeDict.SMS_CAPTCHA_CODE_NOT_EXISTING:
          self.captchaTips.getComponent(cc.Label).string = i18n.t("login.tips.SMS_CAPTCHA_NOT_MATCH");
          break;
        case this.retCodeDict.INCORRECT_PHONE_NUMBER:
          self.captchaTips.getComponent(cc.Label).string = i18n.t("login.tips.INCORRECT_PHONE_NUMBER");
          break;
        case this.retCodeDict.INVALID_REQUEST_PARAM:
          self.captchaTips.getComponent(cc.Label).string = i18n.t("login.tips.INCORRECT_PHONE_NUMBER");
          break;
        case this.retCodeDict.INCORRECT_PHONE_COUNTRY_CODE:
          this.captchaTips.getComponent(cc.Label).string = constants.ALERT.TIP_LABEL.INCORRECT_PHONE_COUNTRY_CODE;
          break;
        default:
          break;
      }
    }
  },
  getQueryVariable: function getQueryVariable(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split("&");
    for (var i = 0; i < vars.length; i++) {
      var pair = vars[i].split("=");
      if (pair[0] == variable) {
        return pair[1];
      }
    }
    return false;
  },
  useWXCodeLogin: function useWXCodeLogin(_code) {
    var self = this;
    NetworkUtils.ajax({
      url: backendAddress.PROTOCOL + '://' + backendAddress.HOST + ':' + backendAddress.PORT + constants.ROUTE_PATH.API + constants.ROUTE_PATH.PLAYER + constants.ROUTE_PATH.VERSION + constants.ROUTE_PATH.WECHAT + constants.ROUTE_PATH.LOGIN,
      type: "POST",
      data: {
        code: _code
      },
      success: function success(res) {
        self.onWechatLoggedIn(res);
      },
      error: function error(xhr, status, errMsg) {
        cc.log('Login attempt "onLoginButtonClicked" failed, about to execute "clearBoundRoomIdInBothVolatileAndPersistentStorage".');
        cc.sys.localStorage.removeItem("selfPlayer");
        window.clearBoundRoomIdInBothVolatileAndPersistentStorage();
        self.wechatLoginTips.string = constants.ALERT.TIP_LABEL.WECHAT_LOGIN_FAILS + ", errorMsg =" + errMsg;
        window.history.replaceState({}, null, window.location.pathname);
      }
    });
  },
  getWechatCode: function getWechatCode(evt) {
    var self = this;
    self.wechatLoginTips.string = "";
    var wechatServerEndpoint = wechatAddress.PROTOCOL + "://" + wechatAddress.HOST + (null != wechatAddress.PORT && "" != wechatAddress.PORT.trim() ? ":" + wechatAddress.PORT : "");
    var url = wechatServerEndpoint + constants.WECHAT.AUTHORIZE_PATH + "?" + wechatAddress.APPID_LITERAL + "&" + constants.WECHAT.REDIRECT_RUI_KEY + NetworkUtils.encode(window.location.href) + "&" + constants.WECHAT.RESPONSE_TYPE + "&" + constants.WECHAT.SCOPE + constants.WECHAT.FIN;
    window.location.href = url;
  },
  initWxSdk: function initWxSdk() {
    if (undefined == wx) {
      cc.warn("please build the project in web-mobile to use the wx jssdk");
      return;
    }
    var selfPlayer = JSON.parse(cc.sys.localStorage.selfPlayer);
    var origUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    /*
    * The `shareLink` must 
    * - have its 2nd-order-domain registered as trusted 2nd-order under the targetd `res.jsConfig.app_id`, and
    * - extracted from current window.location.href.   
    */
    var shareLink = origUrl;
    var updateAppMsgShareDataObj = {
      type: 'link', // 分享类型,music、video或link，不填默认为link
      dataUrl: '', // 如果type是music或video，则要提供数据链接，默认为空
      title: document.title, // 分享标题
      desc: 'Let\'s play together!', // 分享描述
      link: shareLink + (null == cc.sys.localStorage.boundRoomId ? "" : "?expectedRoomId=" + cc.sys.localStorage.boundRoomId),
      imgUrl: origUrl + "/favicon.ico", // 分享图标
      success: function success() {
        // 设置成功
      }
    };
    var menuShareTimelineObj = {
      title: document.title, // 分享标题
      link: shareLink + (null == cc.sys.localStorage.boundRoomId ? "" : "?expectedRoomId=" + cc.sys.localStorage.boundRoomId),
      imgUrl: origUrl + "/favicon.ico", // 分享图标
      success: function success() {}
    };
    //接入微信登录接口
    NetworkUtils.ajax({
      url: backendAddress.PROTOCOL + '://' + backendAddress.HOST + ':' + backendAddress.PORT + constants.ROUTE_PATH.API + constants.ROUTE_PATH.PLAYER + constants.ROUTE_PATH.VERSION + constants.ROUTE_PATH.WECHAT + constants.ROUTE_PATH.JSCONFIG,
      type: "POST",
      data: {
        "url": shareLink,
        "intAuthToken": selfPlayer.intAuthToken
      },
      success: function success(res) {
        if (constants.RET_CODE.OK != res.ret) {
          console.log("cannot get the wsConfig. retCode == " + res.ret);
          return;
        }
        console.log(res.jsConfig);
        var jsConfig = res.jsConfig;
        console.log(updateAppMsgShareDataObj);
        var configData = {
          debug: CC_DEBUG, // 开启调试模式,调用的所有api的返回值会在客户端alert出来，若要查看传入的参数，可以在pc端打开，参数信息会通过log打出，仅在pc端时才会打印。
          appId: jsConfig.app_id, // 必填，公众号的唯一标识
          timestamp: jsConfig.timestamp.toString(), // 必填，生成签名的时间戳
          nonceStr: jsConfig.nonce_str, // 必填，生成签名的随机串
          jsApiList: ['onMenuShareAppMessage'],
          signature: jsConfig.signature // 必填，签名
        };
        wx.config(configData);
        wx.ready(function () {
          console.log("wx config has succeeded, and there is wx.ready");
          wx.onMenuShareAppMessage(updateAppMsgShareDataObj);
          wx.onMenuShareTimeline(menuShareTimelineObj);
        });
        wx.error(function (res) {
          console.error("wx config fails and error is " + JSON.stringify(res));
        });
      },
      error: function error(xhr, status, errMsg) {
        console.log("cannot get the wsConfig. errMsg == " + errMsg);
      }
    });
  }
});

cc._RF.pop();