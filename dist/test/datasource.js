"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.GenericDatasource = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _lodash = require("lodash");

var _lodash2 = _interopRequireDefault(_lodash);

var _sls = require("./sls.js");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var GenericDatasource = exports.GenericDatasource = function () {
    function GenericDatasource(instanceSettings, $q, backendSrv, templateSrv) {
        _classCallCheck(this, GenericDatasource);

        this.type = instanceSettings.type;
        this.url = instanceSettings.url;
        this.name = instanceSettings.name;
        this.projectName = instanceSettings.jsonData.project;
        this.logstore = instanceSettings.jsonData.logstore;
        //this.endpoint = instanceSettings.jsonData.endpoint;
        this.user = instanceSettings.jsonData.user;
        this.password = instanceSettings.jsonData.password;
        this.q = $q;
        this.backendSrv = backendSrv;
        this.templateSrv = templateSrv;
        this.withCredentials = instanceSettings.withCredentials;
        this.headers = { 'Content-Type': 'application/json' };
        if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
            this.headers['Authorization'] = instanceSettings.basicAuth;
        }
        this.defaultConfig = {

            //requires
            accessId: this.user, //accessId
            accessKey: this.password, //accessKey
            //endpoint: this.endpoint,            //sls service endpoint

            //optional
            timeout: 20000, //请求timeout时间, 默认: 20s


            signature_method: 'hmac-sha1', //签名计算方式，目前只支持'hmac-sha1', 默认: 'hmac-sha1'
            api_version: '0.3.0', //数据相关api version 默认 0.3.0

            logger: false //打印请求的详细信息, log4js 实例
        };
    }

    _createClass(GenericDatasource, [{
        key: "query",
        value: function query(options) {
            var _this = this;

            console.log("hello");
            var requests = [];
            var slsclient = new _sls.SLS(this.defaultConfig, this.backendSrv, this.url);
            var promise = Promise.resolve();
            (0, _lodash2.default)(options.targets).forEach(function (target) {
                if (target.hide) {
                    return;
                }
                var request = slsclient.GetData(_this.projectName, {
                    "Category": _this.logstore,
                    "Topic": "",
                    "BeginTime": parseInt(options.range.from._d.getTime() / 1000),
                    "EndTime": parseInt(options.range.to._d.getTime() / 1000),
                    "Query": target.query,
                    "Reverse": "false",
                    "Lines": "100",
                    "Offset": "0"
                }).then(function (result) {
                    if (!(result.data && result.data.GetData && result.data.GetData.Data)) {
                        return Promise.reject(new Error("this promise is rejected"));
                    }

                    result.time_col = target.xcol;
                    result.ycol = _lodash2.default.reduce(target.ycol.split(","), function (result, data) {
                        data = data.split(' ').join('');
                        if (data) {
                            result.push(data);
                        }
                        return result;
                    }, []);
                    return result;
                }).then(function (result) {
                    console.log("test");
                    var resResult = [];
                    (0, _lodash2.default)(result.ycol).forEach(function (col) {
                        var datapoints = [];

                        _lodash2.default.sortBy(result.data.GetData.Data, [result.time_col]).forEach(function (data) {
                            var _time = data[result.time_col];
                            var time = parseInt(_time) * 1000;
                            var value = parseInt(data[col]);
                            datapoints.push([value, time]);
                        });
                        resResult.push({
                            "target": col,
                            "datapoints": datapoints
                        });
                    });
                    return resResult;
                });
                requests.push(request);
            });

            return Promise.all(requests.map(function (p) {
                return p.catch(function (e) {
                    return e;
                });
            })).then(function (requests) {
                console.log("1:", requests);

                var _t = _lodash2.default.reduce(requests, function (result, data) {
                    (0, _lodash2.default)(data).forEach(function (t) {
                        return result.push(t);
                    });
                    return result;
                }, []);
                console.log("1:", _t);
                return {
                    data: _t
                };
            }) // 1,Error: 2,3
            .catch(function (err) {
                if (err.data && err.data.message) {
                    return { status: "error", message: err.data.message, title: "Error" };
                } else {
                    return { status: "error", message: err.status, title: "Error" };
                }
            });
        }
    }, {
        key: "testDatasource",
        value: function testDatasource() {
            var slsclient = new _sls.SLS(this.defaultConfig, this.backendSrv, this.url);
            return slsclient.GetData(this.projectName, {
                "Category": this.logstore,
                "Topic": "",
                "BeginTime": parseInt(new Date().getTime() / 1000 - 900),
                "EndTime": parseInt(new Date().getTime() / 1000),
                "Query": "",
                "Reverse": "false",
                "Lines": "10",
                "Offset": "0"
            }).then(function (result) {

                return { status: "success", message: "Database Connection OK", title: "Success" };
            }, function (err) {
                console.log("testDataSource err", err);
                if (err.data && err.data.message) {
                    return { status: "error", message: err.data.message, title: "Error" };
                } else {
                    return { status: "error", message: err.status, title: "Error" };
                }
            });
        }
    }, {
        key: "annotationQuery",
        value: function annotationQuery(options) {
            var query = this.templateSrv.replace(options.annotation.query, {}, 'glob');
            var annotationQuery = {
                range: options.range,
                annotation: {
                    name: options.annotation.name,
                    datasource: options.annotation.datasource,
                    enable: options.annotation.enable,
                    iconColor: options.annotation.iconColor,
                    query: query
                },
                rangeRaw: options.rangeRaw
            };

            return this.doRequest({
                url: this.url + '/annotations',
                method: 'POST',
                data: annotationQuery
            }).then(function (result) {
                return result.data;
            });
        }
    }, {
        key: "metricFindQuery",
        value: function metricFindQuery(query) {

            var interpolated = {
                target: this.templateSrv.replace(query, null, 'regex')
            };

            return this.doRequest({
                url: this.url + '/search',
                data: interpolated,
                method: 'POST'
            }).then(this.mapToTextValue);
        }
    }, {
        key: "mapToTextValue",
        value: function mapToTextValue(result) {
            return _lodash2.default.map(result.data, function (d, i) {
                if (d && d.text && d.value) {
                    return { text: d.text, value: d.value };
                } else if (_lodash2.default.isObject(d)) {
                    return { text: d, value: i };
                }
                return { text: d, value: d };
            });
        }
    }, {
        key: "doRequest",
        value: function doRequest(options) {
            options.withCredentials = this.withCredentials;
            options.headers = this.headers;

            return this.backendSrv.datasourceRequest(options);
        }
    }, {
        key: "buildQueryParameters",
        value: function buildQueryParameters(options) {
            var _this2 = this;

            //remove placeholder targets
            options.targets = _lodash2.default.filter(options.targets, function (target) {
                return target.target !== 'select metric';
            });

            var targets = _lodash2.default.map(options.targets, function (target) {
                return {
                    target: _this2.templateSrv.replace(target.target, options.scopedVars, 'regex'),
                    refId: target.refId,
                    hide: target.hide,
                    type: target.type || 'timeserie'
                };
            });

            options.targets = targets;

            return options;
        }
    }]);

    return GenericDatasource;
}();
//# sourceMappingURL=datasource.js.map
