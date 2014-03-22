/**
 * philips_hue.js
 * Basic functionality for accessing and contolling a Philips Hue wireless Lamp
 * Allows for bridge/gateway and light scanning, as well as Light ON/OFF/ALERT status update
 * Requires node-hue-api https://github.com/peter-murray/node-hue-api
 * Copyright 2013 Charalampos Doukas - @BuildingIoT
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/


//Require node-hue-api
var hue = require("node-hue-api");
var HueApi = require("node-hue-api").HueApi;

// Require main module
var RED = require(process.env.NODE_RED_HOME+"/red/red");

//store the IP address of the Hue Gateway
var gw_ipaddress = "";


var username, lamp_status, lamp_id, color, brightness;

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}


// The main node definition - most things happen in here
function HueNode(n) {
    // Create a RED node
    RED.nodes.createNode(this,n);

    var node = this;

    //get parameters from user
    this.username = n.username;
    this.lamp_status = n.lamp_status;
    this.lamp_id = n.lamp_id;
    this.color = n.color;
    this.brightness = n.brightness;
   

    // Store local copies of the node configuration (as defined in the .html)
    this.topic = n.topic;

    
    var msg = {};
    
    msg.topic = this.topic;

    this.on("input", function(msg){
        var myMsg = msg;
            //set the lamp status
            //first locate the Hue gateway:
            hue.locateBridges(function(err, result) {

                var msg2 = {};
                msg2.topic = this.topic;
                if (err) throw err;
                //check for found bridges
                if(result[0]!=null) {
                    //save the IP address of the 1st bridge found
                    this.gw_ipaddress = result[0].ipaddress;
                

                    //set light status
                    var api = new HueApi(this.gw_ipaddress, node.username);
                    var lightState = hue.lightState;
                    var state = lightState.create();

                    var status;
                    var lamp = -1;

                    //check for lamp ID in the payload
                    if(myMsg.payload.length>1) {
                        var tmp_status = myMsg.payload.split(":");
                        myMsg.payload = tmp_status[1];
                        lamp = tmp_status[0];

                    }

                    if(myMsg.payload=="ALERT"){
                        status = "ALERT";
                    }
                    else if(node.lamp_status=="ON" || myMsg.payload=="ON") status = "ON";
                    else if(node.lamp_status=="OFF" || myMsg.payload=="OFF") status = "OFF";


                    if(status=="ALERT") {
                        if(lamp!=-1)
                            api.setLightState(lamp, state.alert()).then(displayResult).fail(displayError).done();
                        else
                            api.setLightState(node.lamp_id, state.alert()).then(displayResult).fail(displayError).done();
                    }
                    else if(status=="ON") {
                         if(node.color==null || node.color=="") {
                            if(lamp!=-1)
                                api.setLightState(lamp, state.on().rgb(hexToRgb(myMsg.topic).r,hexToRgb(myMsg.topic).g,hexToRgb(myMsg.topic).b)).then(displayResult).fail(displayError).done();
                            else
                                api.setLightState(node.lamp_id, state.on().rgb(hexToRgb(myMsg.topic).r,hexToRgb(myMsg.topic).g,hexToRgb(myMsg.topic).b)).then(displayResult).fail(displayError).done();
                        }
                        else {
                            if(lamp!=-1)
                                api.setLightState(lamp, state.on().rgb(hexToRgb(node.color).r,hexToRgb(node.color).g,hexToRgb(node.color).b).brightness(node.brightness)).then(displayResult).fail(displayError).done();
                            else
                                api.setLightState(node.lamp_id, state.on().rgb(hexToRgb(node.color).r,hexToRgb(node.color).g,hexToRgb(node.color).b).brightness(node.brightness)).then(displayResult).fail(displayError).done();
                        }
                    }
                    else {
                        if(lamp!=-1)
                            api.setLightState(lamp, state.off()).then(displayResult).fail(displayError).done();
                        else
                            api.setLightState(node.lamp_id, state.off()).then(displayResult).fail(displayError).done();
                    }

                    if(lamp!=-1)
                        msg2.payload = 'Light with ID: '+lamp+ ' was set to '+status;
                    else
                        msg2.payload = 'Light with ID: '+node.lamp_id+ ' was set to '+status;
                    node.send(msg2);
                }
                else {
                    //bridge not found:
                    var msg = {};
                    msg.payload = "Bridge not found!";
                    node.send(msg);
                }

            });
    });


    this.on("close", function() {
        // Called when the node is shutdown - eg on redeploy.
        // Allows ports to be closed, connections dropped etc.
        // eg: this.client.disconnect();
    });

 }

 //hue debugging on the output:
 var displayResult = function(result) {
    console.log(result);
};

var displayError = function(err) {
    console.error(err);
};




// Register the node by name. This must be called before overriding any of the
// Node functions.
RED.nodes.registerType("HueNode",HueNode);
