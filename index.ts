/// <reference path="./typings/async/async.d.ts"/>
/// <reference path="./typings/mongoose/mongoose.d.ts"/>
/// <reference path="./typings/underscore/underscore.d.ts"/>
/// <reference path="./typings/node/node.d.ts"/>


/**
 * Created by Dominic Böttger on 14.01.2014
 * INSPIRATIONlabs GmbH
 * http://www.inspirationlabs.com
 */
var formServer = require('form-server');
import _ = require('underscore');
import fs = require('fs');
import async = require('async');
import url = require('url');
var mongolastic = require('mongolastic');

var molecuel;

/**
 * This module serves the molecuel elements the type definition for database objects
 * @todo implement the dynamic generation of elements
 * @constructor
 */
var elements = function (): void {
  var self = this;

  // is application middleware already registered
  this.appInitialized = false;

  // emit molecuel elements pre init event
  molecuel.emit('mlcl::elements::init:pre', self);

  // uuid
  this.uuid = require('uuid');

  // validation functions
  this.validator = require('validator');

  // default schema definition directory
  this.schemaDir = __dirname + '/definitions';

  this.modelRegistry = {};
  this.schemaRegistry = {};
  this.subSchemaRegistry = {};
  this.schemaDefinitionRegistry = {};

  this.postApiQueue = [];

  this.dataFormHandlerRegQueue = [];
  this.dataFormHandlerReg = [];

  this.typeHandlerRegistry = {};

  /**
   * Schema directory config
   */
  if (molecuel.config.elements && molecuel.config.elements.schemaDir) {
    this.schemaDir = molecuel.config.elements.schemaDir;
  }

  /**
   * Check if database and elasticsearch are available and register the schemas
   */
  var checkInit = function checkInit() {
    if (self.database && self.elastic) {
      molecuel.emit('mlcl::elements::registrations:pre', self);
      // register subschemas from registry
      self.registerSubSchemas();
      // load the definitions
      self.getDefinitions();
      // register schemas from registry
      self.registerSchemas();
      // render Schemas from registry
      self.setElementTypes();
      // all registered event
      molecuel.emit('mlcl::elements::registrations:post', self);
      // send init event
      molecuel.emit('mlcl::elements::init:post', self);
    }
  };

  /**
   * Execute after successful database connection
   */
  molecuel.on('mlcl::database::connection:success', function (database) {
    // mlcl_database module instance
    self.database = database;
    // make mongoose directly available
    self.mongoose = self.database.database;
    // Make the mongoose schema instance available
    var Schema = self.mongoose.Schema;
    var ObjectId = self.mongoose.Schema.ObjectId;
    // Make the ObjectId available as local variable
    self.ObjectId = ObjectId;
    self.Types = self.mongoose.Schema.Types;
    self.coreSchema = Schema;
    self.baseSchema = {
      published: { type: Boolean}
    };
    checkInit();
  });

  /**
   * Execute after successful elasticsearch connection
   */
  molecuel.on('mlcl::search::connection:success', function (elastic) {
    self.elastic = elastic;
    checkInit();
  });

  /**
   * Register form handler for every data Type
   */
  var formHandlerReg = function formHandlerReg() {
    if (self.dataFormHandler) {
      molecuel.emit('mlcl::elements::dataFormHandler::addResources:pre', self);
      async.each(self.dataFormHandlerRegQueue, function (elname: string, callback) {
        if (_.indexOf(self.dataFormHandlerReg, elname) === -1) {
          self.dataFormHandler.addResource(elname, self.modelRegistry[elname], {
            onSave: function(doc, req, callback) {
              molecuel.emit('mlcl::elements::api:save', doc, req);
              async.each(self.postApiQueue, function(queueElement: Function, qcallback: Function) {
                queueElement(doc, req, qcallback);
              }, function() {
                callback(null);
              });
            }
            //@todo findFunc function(req, callback(err, query)) applies a filter to records returned by the server
          });
          self.dataFormHandlerReg.push(elname);
        }
        callback();
      }, function () {
        molecuel.emit('mlcl::elements::dataFormHandler::addResources:post', self);
      });
    }
  };

  molecuel.on('mlcl::elements::dataFormHandlerInit:post', function () {
    formHandlerReg();
  });

  molecuel.on('mlcl::elements::setElementType:post', function () {
    formHandlerReg();
  });

  return this;
};


/* ************************************************************************
 SINGLETON CLASS DEFINITION
 ************************************************************************ */
var instance = null;

var getInstance = function(){
  return instance || (instance = new elements());
};

/**
* Empty findByUrl function until db layer init
* Log error when db layer is not available
*/
elements.prototype.findByUrl = function find(url, lang, callback) {
  molecuel.log.error('elements', 'Database url layer is not initialized');
  callback(new Error('Database layer is not initialized'));
};


/**
 * Save middleware for elements
 *
 * @todo Emit events for molecuel
 */
elements.prototype.save = function(model, callback) {
  mongolastic.save(model, callback);
};

/**
* api handler registration
*/
elements.prototype.registerPostApiHandler = function registerPostApiHandler(handlerFunction) {
  this.postApiQueue.push(handlerFunction);
};

elements.prototype.registerIndexPreprocessor = function registerIndexPreprocessor(handlerFunction) {
  mongolastic.registerIndexPreprocessor(handlerFunction);
};


/**
 * Set the base schema this function is like the not yet available mongoose extend function
 * @param mySchema
 */
elements.prototype.setBaseSchema = function setBaseSchema(mySchema) {
  this.baseSchema = mySchema;
};

/**
 * Extend the base schema
 * @param mySchema
 */
elements.prototype.addToBaseSchema = function addToBaseSchema(mySchema) {
  if (_.isObject(mySchema)) {
    _.extend(this.baseSchema, mySchema);
  }
};

/**
 * Extend the defined schema
 * @param mySchema
 */
elements.prototype.addToSchemaDefinition = function addToSchemaDefinition(schemaname, mySchema) {
  if (_.isObject(mySchema)) {
    _.extend(mySchema, this.schemaDefinitionRegistry[schemaname].schema);

    if (_.isObject(mySchema)) {
      this.schemaDefinitionRegistry[schemaname].schema = mySchema;
    }
  }
};

/**
 * return the base Schema
 * @returns {baseSchema}
 */
elements.prototype.getBaseSchema = function getBaseSchema() {
  return this.baseSchema;
};

/**
 * Init function for the molecuel module
 * @param app the express app
 */
elements.prototype.initApplication = function initApplication() {
  // send init event
  molecuel.emit('mlcl::elements::initApplication:pre', this);

  molecuel.emit('mlcl::elements::initApplication:post', this);
};

elements.prototype.middleware = function middleware(config, app) {
  if(config.type === 'formserver') {
    /**
     * Form handler stuff
     */
      // send init dataForm Handler
    molecuel.emit('mlcl::elements::dataFormHandlerInit:pre', this);

    // initialize the form handler
    this.dataFormHandler = new (formServer)(app, this, molecuel);

    // set the initialized variable to true
    this.appInitialized = true;

    molecuel.emit('mlcl::elements::dataFormHandlerInit:post', this, this.dataFormHandler);
  }
};

/**
 * Express middleware
 */
elements.prototype.get = function get(req, res, next) {
  var self = this;
  if (!req.language || req.language === 'dev') {
    req.language = 'en';
  }
  var urlObject = url.parse(req.url);
  self.searchByUrl(urlObject.pathname, req.language, function (err, result) {
    if (result && result.hits && result.hits.hits && result.hits.hits[0]) {
      var myObject = result.hits.hits[0];
      var mySource = result.hits.hits[0]._source;
      var myType = result.hits.hits[0]._type;
      // set the elements content first for the main section
      mySource._meta = {
        module: 'elements',
        type: myObject._type
      };
      molecuel.setContent(res, 'main', mySource);

      // get the type handler if not default handling
      var currentTypeHandler = self.getTypeHandler(myType);
      // check if there is a special handler for the element type
      if(currentTypeHandler) {
        currentTypeHandler(req, res, next);
      } else {
        next();
      }
    } else {
      next();
    }
  });
};

/**
 * getById returns a element based on the id from the search index
 * @param  {[type]}   index    [description]
 * @param  {[type]}   id       [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
elements.prototype.getById = function get(index, id, callback) {
  this.elastic.connection.get({
    'index': this.elastic.getIndexName(index),
    'type': index,
    'id': id
  }, callback)
};

/**
 * syncMiddleware - Sync function for the data model
 *
 * @param  {type} req description
 * @param  {type} res description
 * @return {type}     description
 *
 * @todo Reimplementation of sync function in underlying mongolastic module
 *       It shoul be able to create a new index and change the alias from the old
 *       index to the new one. After that the old index can be deleted.
 *
 */
elements.prototype.syncMiddleware = function syncMiddleware(req, res) {
  if(req.query.model) {
    var elements = getInstance();
    var model = elements.getModel(req.query.model);
    model.resync(req.query.model);
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
};

/**
 * Inject a definition manually
 * @param name
 * @param definition
 * @param indexable
 */
elements.prototype.injectDefinition = function injectDefinition(name, definition, indexable) {
  this.setElementType(name, definition, indexable);
};

/**
 * Load the definitions
 * @todo load from configuration
 */
elements.prototype.getDefinitions = function getDefinitions() {
  molecuel.emit('mlcl::elements::preGetDefinitions', this);
  var self = this;

  /**
   * Load schema definitions
   * @type {*}
   */
  var defFiles = fs.readdirSync(this.schemaDir);
  defFiles.forEach(function (entry) {
    var currentSchema = require(self.schemaDir + '/' + entry)(self);
    self.registerSchemaDefinition(currentSchema);
  });
  molecuel.emit('mlcl::elements::postGetDefinitions', this);
};

/**
 * Get the Subschema and if it's not already instantiated as subschema add it to the subschema registry
 * @param schemaname
 * @returns {*}
 */
elements.prototype.getSubSchemaSchema = function getSubSchemaSchema(schemaname) {
  if (this.subSchemaRegistry[schemaname] && this.subSchemaRegistry[schemaname].schema) {
    return this.subSchemaRegistry[schemaname].schema;
  } else {
    if (this.schemaDefinitionRegistry[schemaname].schema
      && this.schemaDefinitionRegistry[schemaname].options
      && this.schemaDefinitionRegistry[schemaname].options.subSchema) {
      this.registerSubSchema(schemaname);
      if (this.subSchemaRegistry[schemaname] && this.subSchemaRegistry[schemaname].schema) {
        return this.subSchemaRegistry[schemaname].schema;
      }
    }
  }
  return null;
};

/**
 * Register Schema
 * @param schemaname
 * @param schema
 * @param config
 */
elements.prototype.registerSchemaDefinition = function registerSchemaDefinition(schema, coreSchema) {
  var schemaName = schema.schemaName;
  molecuel.emit('mlcl::elements::registerSchemaDefinition:pre', this, schema.schemaName, schema, coreSchema);
  molecuel.emit('mlcl::elements::registerSchemaDefinition:pre::' + schema.schemaName, this, schema, coreSchema);

  if (!this.schemaDefinitionRegistry[schemaName]) {
    this.schemaDefinitionRegistry[schemaName] = schema;
    if (coreSchema) {
      this.schemaDefinitionRegistry[schemaName].coreSchema = coreSchema;
    }
  }

  molecuel.emit('mlcl::elements::registerSchemaDefinition:post::' + schemaName, this, this.schemaDefinitionRegistry[schema.schemaName]);
  molecuel.emit('mlcl::elements::registerSchemaDefinition:post', this, schemaName, this.schemaDefinitionRegistry[schema.schemaName]);
};

/**
 * Register all possible Subschemas
 */
elements.prototype.registerSubSchemas = function registerSubSchemas() {
  for (var name in this.schemaDefinitionRegistry) {
    if (this.schemaDefinitionRegistry[name].options.subSchema === true) {
      this.registerSubSchema(name);
    }
  }
};

/**
 * Register as possible subschema
 * @param schemaname
 * this is the place to extend the schema by other modules in the preRegister phase
 */
elements.prototype.registerSubSchema = function registerSubSchema(schemaname) {
  molecuel.emit('mlcl::elements::registerSubSchema:pre', this, schemaname, this.schemaDefinitionRegistry[schemaname]);
  molecuel.emit('mlcl::elements::registerSubSchema:pre::' + schemaname, this, this.schemaDefinitionRegistry[schemaname]);

  // create the schema
  var modelSchema = new this.coreSchema(this.schemaDefinitionRegistry[schemaname].schema);

  // add to schema registry
  this.subSchemaRegistry[schemaname] = {};
  this.subSchemaRegistry[schemaname].schema = modelSchema;
  this.subSchemaRegistry[schemaname].options = this.schemaDefinitionRegistry[schemaname].options;
  this.subSchemaRegistry[schemaname].indexes = this.schemaDefinitionRegistry[schemaname].indexes;

  // emit post register events
  molecuel.emit('mlcl::elements::registerSubSchema:post::' + schemaname, this, modelSchema);
  molecuel.emit('mlcl::elements::registerSubSchema:post', this, schemaname, modelSchema);
};

/**
 * Register schema as mongoose schema
 * @param schemaname
 * this is the place to extend the schema by other modules in the preRegister phase
 */
elements.prototype.registerSchema = function registerSchema(schemaname) {
  var self = this;
  molecuel.emit('mlcl::elements::registerSchema:pre', this, schemaname, this.schemaDefinitionRegistry[schemaname]);
  molecuel.emit('mlcl::elements::registerSchema:pre::' + schemaname, this, this.schemaDefinitionRegistry[schemaname]);
  // merge after putting into registry

  var currentSchema = {};
  _.extend(currentSchema, this.baseSchema, this.schemaDefinitionRegistry[schemaname].schema);

  // if another schema is defined for the element
  if (this.schemaDefinitionRegistry[schemaname].coreSchema) {
    currentSchema = this.coreSchema;
  }

  var options = this.schemaDefinitionRegistry[schemaname].options;

  var schemaOptions:any = {};

  if (options.collection) {
    schemaOptions.collection = options.collection;
  }
  if (options.safe) {
    schemaOptions.safe = options.safe;
  }

  // create the schema
  var modelSchema = new this.coreSchema(currentSchema, schemaOptions);

  // add default plugin
  modelSchema.plugin(self._defaultSchemaPlugin);

  // add indexes
  _.each(this.schemaDefinitionRegistry[schemaname].indexes, function(index) {
    modelSchema.index(index);
  });

  // add to schema registry
  this.schemaRegistry[schemaname] = {};
  this.schemaRegistry[schemaname].schema = modelSchema;
  this.schemaRegistry[schemaname].options = this.schemaDefinitionRegistry[schemaname].options;
  this.schemaRegistry[schemaname].indexes = this.schemaDefinitionRegistry[schemaname].indexes;


  // emit post register event and send the schemaRegistry for the current schema including the model
  molecuel.emit('mlcl::elements::registerSchema:post', this, schemaname, this.schemaRegistry[schemaname]);
  molecuel.emit('mlcl::elements::registerSchema:post::'+schemaname, this, this.schemaRegistry[schemaname]);
};

/**
 * Registers all schemas in schemadefinition registry
 * @param schemaname
 */
elements.prototype.registerSchemas = function registerSchemas() {
  for (var name in this.schemaDefinitionRegistry) {
    if(this.schemaDefinitionRegistry.hasOwnProperty(name)) {
      this.registerSchema(name);
    }
  }
};

/**
 * Get all schemas of all defined elements
 */
elements.prototype.getElementTypeSchemas = function getElementTypeSchemas() {

};

/**
 * Get the schema config of a element
 */
elements.prototype.getElementTypeSchemaConfig = function getElementTypeSchemaConfig(elementtypename) {
  return this.schemaRegistry[elementtypename];
};

/**
 * Get all definitions of all types
 */
elements.prototype.getElementTypes = function getElementTypes() {

};

/**
 * Get the element of a specific type
 * @param typename
 * @todo implement this
 */
elements.prototype.getElementType = function getElementType(typename) {
  return this.modelRegistry[typename];
};

/**
 * Get All available type names
 */
elements.prototype.getElementTypeNames = function getElementTypeNames() {

};


/**
 * Register Schema definitions
 *
 */
elements.prototype.setElementTypes = function setElementTypes() {
  molecuel.emit('mlcl::elements::setElementTypes:pre', this);
  for (var name in this.schemaRegistry) {
    if (this.schemaRegistry[name].options && !this.schemaRegistry[name].options.noCollection) {
      this.setElementType(name);
    }
  }
  molecuel.emit('mlcl::elements::setElementTypes:post', this);
};

/**
 * Set a element type and it's definition
 * @param typename
 * @param definition
 * @param indexable Add to search engine?
 * @param coreSchema can be used to use the mongoose core schema
 */
elements.prototype.setElementType = function setElementType(typeName) {
  molecuel.emit('mlcl::elements::setElementType:pre', this, typeName, this.schemaRegistry[typeName]);
  molecuel.emit('mlcl::elements::setElementType:pre::' + typeName, this, this.schemaRegistry[typeName]);

  var model = this.database.registerModel(typeName, this.schemaRegistry[typeName].schema, this.schemaRegistry[typeName].options);

  if(this.schemaDefinitionRegistry[typeName].search) {
    model.elastic = this.schemaDefinitionRegistry[typeName].search;
  }

  // add the model to the model registry
  this.modelRegistry[typeName] = model;

  // add a form handler for the ressource
  this.dataFormHandlerRegQueue.push(typeName);

  molecuel.emit('mlcl::elements::setElementType:post', this, typeName, model);
  molecuel.emit('mlcl::elements::setElementType:post::' + typeName, this, model);
};

/**
 * Get the fields from the system
 */
elements.prototype.getFields = function getFields() {

};

elements.prototype._defaultSchemaPlugin = function _defaultSchemaPlugin(schema) {
  /**
   * Add fields
   */
  schema.add({
    updatedat: { type: Date, default: Date.now, form: {readonly: true} },
    createdat: { type: Date, default: Date.now, form: {readonly: true} },
    publishedat: {type: Date, form: {readonly: true}}
  });

  /**
   * Set published date
   */
  schema.path('published').set(function(newval) {
    if(this.published === false && newval === true)  {
      this.publishedat = new Date();
    }
    return newval;
  });

  /**
   * pre validation function to create a url if it does not exist yet
   */
  schema.pre('save', function (next) {
    this.updatedat = new Date();
    next();
  });
};

/**
 * Get a field by name
 * @param fieldname
 * @todo implement this
 */
/*elements.prototype.getField = function (fieldname) {

 };*/

/**
 * Set or create a field
 * @param fieldname
 * @param definition
 * @todo implement this
 */
/*
 elements.prototype.setField = function (fieldname, definition) {

 };*/

/**
 * Search for element by url
 * @param url
 * @param language
 * @param callback
 */
elements.prototype.searchByUrl = function searchByUrl(url, language, callback) {
  if (this.elastic) {
    this.elastic.searchByUrl(url, language, callback);
  } else {
    callback(new Error('No Elasticsearch connection'));
  }
};

elements.prototype.getModelNames = function getModelNames() {
};

/**
 * Return the model from the model registry
 * @param modelName
 * @returns {*}
 */
elements.prototype.getModel = function getModel(modelName) {
  return this.modelRegistry[modelName];
};

/**
 * Register a handler for a element type
 * @param type
 * @param handler
 */
elements.prototype.registerTypeHandler = function registerTypeHandler(type, handler ) {
  this.typeHandlerRegistry[type] = handler;
};

/**
 * Get the handler for a element type
 * @param type
 * @returns {*}
 */
elements.prototype.getTypeHandler = function getTypeHandler(type) {
  return this.typeHandlerRegistry[type];
};

/**
 * Unregister the type handler
 * @param type
 */
elements.prototype.unregisterTypeHandler = function unregisterTypeHandler(type) {
  delete this.typeHandlerRegistry[type];
};

/**
 * Search for element by id
 */

/**
 * Syncs a model to elasticsearch
 */
elements.prototype.sync = function sync(modelName, callback) {
  if(this.modelRegistry[modelName]) {
    if (this.elastic) {
      this.elastic.sync(this.modelRegistry[modelName], modelName, callback);
    } else {
      callback(new Error('No Elasticsearch connection'));
    }
  }
};

var init = function (m) {
  // store molecuel instance
  molecuel = m;
  return getInstance();
};

module.exports = init;