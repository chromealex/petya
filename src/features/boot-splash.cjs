// Startup splash: tells the renderer whether the window is already on screen, e.g. after a reload on company switch.
module.exports={name:'bootSplash',defaults:{},validate(){},setup(services){
 return {ipc:{visible(){const win=services.win;return !!win&&!win.isDestroyed()&&win.isVisible();}}};
}};
