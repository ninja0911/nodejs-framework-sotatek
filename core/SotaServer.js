// Expose global lib
hbs         = require('hbs');

var SotaApp = require('./SotaApp');

let rootDir = path.join(path.resolve('.'));

class SotaServer extends SotaApp {

  start() {
    super.start();
    this._initExpress();
  }

  _resolveConfig(config) {
    this._configDirectory();
    this._configRoute();
    this._configMiddleware();
    this._configPolicy();
    this._configController();
    this._configSocket(config);

    super._resolveConfig(config);
  }

  _configDirectory() {
    /**
     * publicDir should be the folder contains static files
     */
     this._appConfig.publicDir = path.join(rootDir, 'public');

     /**
     * viewDir should be the folder contains view templates
     */
     this._appConfig.viewDir = path.join(rootDir, 'views');
     this._appConfig.port = process.env.PORT;
  }

  _configRoute() {
    /**
     * Routes
     */
    let routeConfigFile = path.resolve(rootDir, 'config', 'Routes.js');
    if (!FileUtils.isFileSync(routeConfigFile)) {
      throw new Error('Routes configuration file does not exist: ' + routeConfigFile);
    }
    this._appConfig.routes = require(routeConfigFile);
  }

  _configMiddleware() {
    /**
     * Middlewares
     */
    let middlwareConfigFile = path.resolve(rootDir, 'config', 'Middlewares.js');
    if (FileUtils.isFileSync(middlwareConfigFile)) {
      this._appConfig.middlewares = require(middlwareConfigFile);
    } else {
      this._appConfig.middlewares = {};
    }

    let middlewareDirs = [],
       appMiddlewareDir = path.resolve(rootDir, 'app', 'middlewares');
    middlewareDirs.push(path.resolve(rootDir, 'core', 'middleware'));
    if (FileUtils.isDirectorySync(appMiddlewareDir)) {
      middlewareDirs.push(appMiddlewareDir);
    }
    this._appConfig.middlewareDirs = middlewareDirs;
  }

  _configPolicy() {
    /**
     * Policies are stored in:
     * - core/policy/     (core-level)
     * - app/policies/    (app-level)
     */
    let policyDirs = [],
        appPolicyDir = path.resolve(rootDir, 'app', 'policies');
    policyDirs.push(path.resolve(rootDir, 'core', 'policy'));
    if (FileUtils.isDirectorySync(appPolicyDir)) {
      policyDirs.push(appPolicyDir);
    }
    this._appConfig.policyDirs = policyDirs;
  }

  _configController() {

    /**
     * There's no specific controller in core-level
     * The folder normally contains controllers is
     * - app/controllers/
     */
    let controllerDirs = [],
        appControllerDir = path.resolve(rootDir, 'app', 'controllers');
    controllerDirs.push(path.resolve(rootDir, 'core', 'controller'));
    if (FileUtils.isDirectorySync(appControllerDir)) {
      controllerDirs.push(appControllerDir);
    }
    this._appConfig.controllerDirs = controllerDirs;
  }

  _configSocket() {
    /**
     * Sockets:
     * - app/sockets/
     */
    let socketDirs = [],
        appSocketDir = path.resolve(rootDir, 'app', 'sockets');
    if (FileUtils.isDirectorySync(appSocketDir)) {
      socketDirs.push(appSocketDir);
    }
    this._appConfig.socketDirs = socketDirs;
  }

  getMyServer() {
    return this._myServer;
  }

  _initExpress() {
    logger.trace('SotaServer::_initExpress initializing express application...');
    var myExpressApp = require('./initializer/Express')(this._appConfig);
    var myServer = require('http').createServer(myExpressApp);

    process.nextTick(function() {
      var port = this._appConfig.port;
      if (this._appConfig.isPortHiddenOnClusterMode) {
        port = 0;
      }
      myServer.listen(port, this.onServerCreated.bind(this));
      myServer.on('error', this.onError.bind(this));
      myServer.on('listening', this.onListening.bind(this));

      if (typeof this._initCallback === 'function') {
        this._initCallback();
        delete this._initCallback;
      }
    }.bind(this));

    this._initMiddlewares(myExpressApp);
    this._setupPassport(myExpressApp);
    this._setupRoutes(myExpressApp);
    this._initSocket(myExpressApp, myServer);

    this._myServer = myServer;
  }

  _setupRoutes(myExpressApp) {
    var init = require('./initializer/Routes');
    init(myExpressApp, ControllerFactory, this._appConfig);
  }

  _initMiddlewares(myExpressApp) {
    var init = require('./initializer/Middleware');
    init(myExpressApp, this._appConfig);
  }

  _setupPassport(myExpressApp) {
    var init = require('./initializer/Passport');
    init(myExpressApp);
  }

  _initSocket(myExpressApp, myServer) {
    var init = require('./initializer/Socket'),
        socketDirs = this._appConfig.socketDirs;

    init(myExpressApp.get('jwtSecret'), myServer, socketDirs);
  }

}

module.exports = SotaServer;
