import _ from "lodash";
import {SLS} from "./sls.js";
export class GenericDatasource {

  constructor(instanceSettings, $q, backendSrv, templateSrv) {
    this.type = instanceSettings.type;
    this.url = instanceSettings.url;
    this.name = instanceSettings.name;
    this.projectName = instanceSettings.jsonData.project;
    this.logstore = instanceSettings.jsonData.logstore;
    //this.endpoint = instanceSettings.jsonData.endpoint;
    this.user = instanceSettings.jsonData.user;
    this.password = instanceSettings.jsonData.password;
    console.log(instanceSettings);
    this.q = $q;
    this.backendSrv = backendSrv;
    this.templateSrv = templateSrv;
    this.withCredentials = instanceSettings.withCredentials;
    this.headers = {'Content-Type': 'application/json'};
    console.log(this.url);
    if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
      this.headers['Authorization'] = instanceSettings.basicAuth;
    }
    this.defaultConfig = { 

          //requires
          accessId: this.user,                  //accessId
          accessKey: this.password,                 //accessKey
          //endpoint: this.endpoint,            //sls service endpoint

          //optional
          timeout: 20000,         //请求timeout时间, 默认: 20s

          signature_method: 'hmac-sha1', //签名计算方式，目前只支持'hmac-sha1', 默认: 'hmac-sha1'
          api_version: '0.3.0',  //数据相关api version 默认 0.3.0

          logger: false   //打印请求的详细信息, log4js 实例
      };

  }

  query(options) {
      console.log("query",options);
    var query = options.targets[0].query;
    var slsclient = new SLS(this.defaultConfig,this.backendSrv,this.url);
    return       slsclient.GetData(this.projectName,
            {
            "Category" :this.logstore,
            "Topic":"",
            "BeginTime":parseInt(options.range.from._d.getTime()/1000),
            "EndTime":parseInt(options.range.to._d.getTime()/1000),
            "Query":query,
            "Reverse":"false",
            "Lines":"100",
            "Offset":"0"
            }).then(function(result){
                if(result.data&& result.data.GetData && result.data.GetData.Data){
                  var data = result.data.GetData.Data;
                  if (data.length > 0) {
                    var keys = [];
                    var res = {};
                    console.log(data);
                    for (var i in options.targets) {
                      var target = options.targets[i];
                      if(target.xcol)
                      {
                        keys.push([target.ycol, target.xcol]);
                        res[target.ycol] = [];
                      }
                    }
                    var hasTimeKey = true;
                    
                    if(keys.length ==0){
                      var tmpkeys = Object.keys(data[0]).filter(k => k != "__time__" && k!= "__source__");
                      hasTimeKey = false;
                      for(var i in tmpkeys)
                        keys.push([tmpkeys[i],null]);
                        res[tmpkeys[i]] =[];
                    }
                    console.log(keys);

                    for (var o in data) {
                      var obj = data[o];
                      for (var i in keys) {
                        var k = keys[i];
                        var xv = null;
                        if(k[1] != null){
                          xv=parseInt(obj[k[1]]);
                          xv = xv * 1000;
                        }
                        res[k[0]].push([parseInt(obj[k[0]]), xv]);
                      }
                    }

                    var finalRes = [];
                    for (var i in keys) {
                      var k = keys[i];
                      var dataPoints = res[k[0]];
                      if(!hasTimeKey){
                        finalRes.push({
                          "target": k[0],
                          "datapoints": dataPoints
                        })
                        continue;
                      }
                      var all_time_pos = {};
                      for( var j in dataPoints){
                        all_time_pos[dataPoints[j][1]]=j;
                      }
                      var sorted_time= Object.keys(all_time_pos).sort();
                      console.log(sorted_time);
                      var resDataPoints = [];
                      for(var j in sorted_time){
                        var t = sorted_time[j];
                        resDataPoints.push(dataPoints[all_time_pos[t]]);
                      }
                      finalRes.push(
                        {
                          "target": k[0],
                          "datapoints": resDataPoints
                        }
                      )
                    }
                    console.log(finalRes);
                    var fres = result;
                    fres["data"] = finalRes;
                    return fres;
                  }
                }
                return { status: "success", message: "Database Connection OK", title: "Success" };
                },function(err){
                console.log("testDataSource err",err);
                if (err.data && err.data.message) {
                return { status: "error", message: err.data.message, title: "Error" };
                } else {
                return { status: "error", message: err.status, title: "Error" };
                }
                });
  }

  testDatasource() {
    var slsclient = new SLS(this.defaultConfig,this.backendSrv,this.url);
    return       slsclient.GetData(this.projectName,
            {
            "Category" :this.logstore,
            "Topic":"",
            "BeginTime":parseInt((new Date().getTime()/1000)-900),
            "EndTime":parseInt(new Date().getTime()/1000),
            "Query":"",
            "Reverse":"false",
            "Lines":"10",
            "Offset":"0"
            }).then(function(result){

                return { status: "success", message: "Database Connection OK", title: "Success" };
                },function(err){
                console.log("testDataSource err",err);
                if (err.data && err.data.message) {
                return { status: "error", message: err.data.message, title: "Error" };
                } else {
                return { status: "error", message: err.status, title: "Error" };
                }

                });

        
  }

  annotationQuery(options) {
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
    }).then(result => {
      return result.data;
    });
  }

  metricFindQuery(query) {

    var interpolated = {
        target: this.templateSrv.replace(query, null, 'regex')
    };

    return this.doRequest({
      url: this.url + '/search',
      data: interpolated,
      method: 'POST',
    }).then(this.mapToTextValue);
  }

  mapToTextValue(result) {
    return _.map(result.data, (d, i) => {
      if (d && d.text && d.value) {
        return { text: d.text, value: d.value };
      } else if (_.isObject(d)) {
        return { text: d, value: i};
      }
      return { text: d, value: d };
    });
  }

  doRequest(options) {
    options.withCredentials = this.withCredentials;
    options.headers = this.headers;

    return this.backendSrv.datasourceRequest(options);
  }

  buildQueryParameters(options) {
    //remove placeholder targets
    options.targets = _.filter(options.targets, target => {
      return target.target !== 'select metric';
    });

    var targets = _.map(options.targets, target => {
      return {
        target: this.templateSrv.replace(target.target, options.scopedVars, 'regex'),
        refId: target.refId,
        hide: target.hide,
        type: target.type || 'timeserie'
      };
    });

    options.targets = targets;

    return options;
  }
}