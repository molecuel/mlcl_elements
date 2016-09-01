'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const mongodb = require('mongodb');
const elasticsearch = require('elasticsearch');
require('reflect-metadata');
const _ = require('lodash');
const TSV = require('tsvalidate');
const ELD = require('./elementDecorators');
const ElasticOptions_1 = require('./classes/ElasticOptions');
var Element_1 = require('./classes/Element');
exports.Element = Element_1.Element;
class Elements {
    constructor(mlcl, config) {
        this.elementStore = new Map();
        this.elasticOptions = new ElasticOptions_1.ElasticOptions();
        this.elasticOptions.url = 'http://localhost:9200';
        this.elasticOptions.loglevel = 'trace';
        this.elasticOptions.timeout = 5000;
        this.mongoClient = mongodb.MongoClient;
        this.elasticClient = new elasticsearch.Client({
            host: 'localhost:9200',
            log: 'trace'
        });
    }
    connect() {
        return __awaiter(this, void 0, Promise, function* () {
            yield this.connectElastic();
            yield this.connectMongo();
        });
    }
    registerClass(name, definition, indexSettings) {
        return __awaiter(this, void 0, Promise, function* () {
            definition.elements = this;
            this.elementStore.set(name, definition);
            return yield this.registerIndex(name, definition, indexSettings);
        });
    }
    getClass(name) {
        return this.elementStore.get(name);
    }
    getClassInstance(name) {
        let elementClass = this.elementStore.get(name);
        let classInstance = new elementClass();
        classInstance.setFactory(this);
        return classInstance;
    }
    validate(instance) {
        let validator = new TSV.Validator();
        return validator.validate(instance);
    }
    toDbObject(element) {
        return this.toDbObjRecursive(element, false);
    }
    toDbObjRecursive(obj, nested) {
        let that = obj;
        let result = {};
        let objectValidatorDecorators = Reflect.getMetadata(TSV.METADATAKEY, that);
        let propertiesValidatorDecorators = _.keyBy(objectValidatorDecorators, function (o) {
            return o.property;
        });
        for (let key in that) {
            if (Object.hasOwnProperty.call(that, key)
                && that[key] !== undefined
                && propertiesValidatorDecorators[key]) {
                if (key === '_id'
                    && !nested) {
                    result[key] = that[key];
                }
                else if (typeof that[key] === 'object') {
                    result[key] = this.toDbObjRecursive(that[key], true);
                }
                else if (typeof that[key] !== 'function') {
                    result[key] = that[key];
                }
            }
        }
        return result;
    }
    mongoClose() {
        return this.getMongoConnection().close();
    }
    getMongoConnection() {
        return this.mongoConnection;
    }
    getElasticConnection() {
        return this.elasticClient;
    }
    getMongoCollections() {
        return __awaiter(this, void 0, Promise, function* () {
            return yield this.getMongoConnection().collections();
        });
    }
    containsIDocuments(obj) {
        let template = {
            collection: 'collectionName',
            documents: []
        };
        for (let prop in template) {
            if (!(prop in obj)) {
                return false;
            }
        }
        return true;
    }
    findByQuery(collection, query, limit) {
        return __awaiter(this, void 0, Promise, function* () {
            let input = collection;
            let collectionName;
            if (typeof input === 'string') {
                collectionName = input;
            }
            else if ('prototype' in input) {
                collectionName = input.prototype.constructor.name;
            }
            else {
                collectionName = input.constructor.name;
            }
            return yield this.getMongoConnection().collection(collectionName).find(query).limit(limit || 0).toArray().then((res) => {
                return this.toElementArray({ collection: collectionName, documents: res });
            });
        });
    }
    findById(id, collection) {
        return __awaiter(this, void 0, Promise, function* () {
            let inputColl = collection;
            let inputId = id;
            let collectionName;
            if (typeof collection !== 'undefined') {
                if (typeof inputColl === 'string') {
                    collectionName = inputColl;
                }
                else if ('prototype' in inputColl) {
                    collectionName = inputColl.prototype.constructor.name;
                }
                else {
                    collectionName = inputColl.constructor.name;
                }
            }
            else if (typeof inputId !== 'number'
                && typeof inputId !== 'string') {
                if ('constructor' in inputId) {
                    collectionName = id.constructor.name;
                }
                if ('_id' in inputId) {
                    inputId = inputId._id;
                }
                else {
                    return Promise.reject(new Error('No valid id supplied.'));
                }
            }
            else {
                return Promise.reject(new Error('Could not determine target collection.'));
            }
            return yield this.findByQuery(collectionName, { _id: inputId }, 1);
        });
    }
    search(query) {
        return __awaiter(this, void 0, Promise, function* () {
            let input = query;
            if (this.elasticOptions.prefix) {
                if (!input.index) {
                    input.index = this.elasticOptions.prefix + '-*';
                }
                else if (!input.index.match(new RegExp('^' + this.elasticOptions.prefix + '-'))) {
                    input.index = this.elasticOptions.prefix + '-' + input.index;
                }
            }
            return yield this.getElasticConnection().search(input);
        });
    }
    mongoConnectWrapper() {
        return this.mongoClient.connect('mongodb://localhost/elements?connectTimeoutMS=10000&socketTimeoutMS=10000', { promiseLibrary: Promise });
    }
    connectMongo() {
        return __awaiter(this, void 0, Promise, function* () {
            this.mongoConnection = yield this.mongoConnectWrapper();
        });
    }
    elasticConnectWrapper() {
        return this.elasticClient.ping({
            requestTimeout: this.elasticOptions.timeout,
            hello: 'elasticsearch'
        });
    }
    connectElastic() {
        return __awaiter(this, void 0, Promise, function* () {
            this.elasticConnection = yield this.elasticConnectWrapper();
        });
    }
    updateMongoElements(instances, collectionName, upsert) {
        return __awaiter(this, void 0, Promise, function* () {
            if (!upsert) {
                upsert = false;
            }
            let bulk = yield this.getMongoConnection().collection(collectionName).initializeUnorderedBulkOp();
            _.each(instances, (instance) => {
                if (upsert) {
                    bulk.find({ _id: instance._id }).upsert().updateOne(instance);
                }
                else {
                    bulk.find({ _id: instance._id }).updateOne(instance);
                }
            });
            return yield bulk.execute();
        });
    }
    updateMongoElementSingle(instance, collectionName, upsert) {
        return __awaiter(this, void 0, Promise, function* () {
            if (!upsert) {
                upsert = false;
            }
            return yield this.getMongoConnection().collection(collectionName).updateOne({ _id: instance._id }, instance, { upsert: upsert });
        });
    }
    validateAndSort(instances) {
        let errors = [];
        let collections = {};
        for (let instance of instances) {
            let metadata = Reflect.getMetadata(ELD.METADATAKEY, instance.constructor);
            let collectionName = instance.constructor.name;
            _.each(metadata, (entry) => {
                if ('type' in entry
                    && entry.type === ELD.Decorators.USE_MONGO_COLLECTION
                    && 'value' in entry
                    && 'property' in entry
                    && entry.property === instance.constructor.name) {
                    collectionName = entry.value;
                }
            });
            if (instance.validate().length === 0) {
                if (!collections[collectionName]) {
                    collections[collectionName] = [instance.toDbObject()];
                }
                else {
                    collections[collectionName].push(instance.toDbObject());
                }
            }
            else {
                errors = errors.concat(instance.validate());
            }
        }
        if (errors.length > 0) {
            return Promise.reject(errors);
        }
        else {
            return Promise.resolve(collections);
        }
    }
    mongoUpdate(collections, upsert) {
        return __awaiter(this, void 0, Promise, function* () {
            let result = [];
            if (!upsert) {
                upsert = false;
            }
            for (let collectionName in collections) {
                let collectionFullName = collectionName;
                let prom = yield this.updateMongoElements(collections[collectionName], collectionFullName, upsert);
                result.push({ [collectionName]: prom });
            }
            return Promise.resolve(result);
        });
    }
    saveInstances(instances, upsert) {
        return __awaiter(this, void 0, Promise, function* () {
            if (!upsert) {
                upsert = false;
            }
            if (instances.length === 1) {
                if (instances[0].validate().length > 0) {
                    return Promise.reject(instances[0].validate());
                }
                else {
                    let metadata = Reflect.getMetadata(ELD.METADATAKEY, instances[0].constructor);
                    let collectionName = instances[0].constructor.name;
                    _.each(metadata, (entry) => {
                        if ('type' in entry
                            && entry.type === ELD.Decorators.USE_MONGO_COLLECTION
                            && 'value' in entry
                            && 'property' in entry
                            && entry.property === instances[0].constructor.name) {
                            collectionName = entry.value;
                        }
                    });
                    let that = this;
                    return yield this.updateMongoElementSingle(instances[0].toDbObject(), collectionName, upsert).then(function (mres) {
                        return __awaiter(this, void 0, void 0, function* () {
                            if (mres
                                && ((mres.upsertedId && instances[0]._id === mres.upsertedId._id)
                                    || (mres.modified && mres.modified >= 1))) {
                                yield that.updateElasticElementSingle(instances[0], upsert).then((eres) => {
                                    return eres;
                                });
                            }
                            return [{ result: mres.result, ops: mres.ops, upsertedCount: mres.upsertedCount, upsertedId: mres.upsertedId }];
                        });
                    });
                }
            }
            else {
                return this.validateAndSort(instances).then((res) => {
                    return this.mongoUpdate(res, upsert);
                });
            }
        });
    }
    createElastic(element) {
        return __awaiter(this, void 0, Promise, function* () {
            let _body = element.toDbObject();
            delete _body._id;
            return yield this.getElasticConnection().create({
                index: this.getIndexName(element),
                type: element.constructor.name,
                id: element._id,
                body: _body
            });
        });
    }
    updateElasticElementSingle(element, upsert) {
        return __awaiter(this, void 0, Promise, function* () {
            let _body = element.toDbObject();
            delete _body._id;
            if (!upsert) {
                upsert = false;
            }
            if (upsert) {
                return yield this.getElasticConnection().index({
                    index: this.getIndexName(element),
                    type: element.constructor.name,
                    id: element._id,
                    body: _body
                });
            }
            else {
                return yield this.getElasticConnection().update({
                    index: this.getIndexName(element),
                    type: element.constructor.name,
                    id: element._id,
                    body: _body
                });
            }
        });
    }
    registerIndex(name, definition, indexSettings) {
        return __awaiter(this, void 0, Promise, function* () {
            let configuration = {
                mappings: {}
            };
            configuration.mappings[definition.name] = this.getMappingProperties(definition);
            if (indexSettings) {
                if (indexSettings.settings) {
                    configuration['settings'] = indexSettings.settings;
                }
                if (indexSettings.aliases) {
                    configuration['aliases'] = indexSettings.aliases;
                }
            }
            return yield this.getElasticConnection().indices.create({
                index: this.getIndexName(this.getClassInstance(name)),
                body: configuration
            });
        });
    }
    getMappingProperties(model) {
        let result = {};
        let propertyDecorators = _.concat(Reflect.getMetadata(TSV.METADATAKEY, new model()), Reflect.getMetadata(ELD.METADATAKEY, new model()));
        _.each(propertyDecorators, (decorator) => {
            if (decorator && _.find(propertyDecorators, function (checkedDecorator) {
                return (checkedDecorator
                    && checkedDecorator.property === decorator.property
                    && checkedDecorator.type === ELD.Decorators.INDEX_MAPPING
                    && checkedDecorator.property !== model.name
                    && checkedDecorator.property !== '_id');
            }) && !_.find(propertyDecorators, function (checkedDecorator) {
                return (checkedDecorator
                    && checkedDecorator.property === decorator.property
                    && checkedDecorator.type === ELD.Decorators.NOT_FOR_ELASTIC
                    && checkedDecorator.property !== model.name
                    && checkedDecorator.property !== '_id');
            })) {
                if (!result['properties']) {
                    result = { properties: {} };
                }
                if (_.find(propertyDecorators, (checkedDecorator) => {
                    return (checkedDecorator
                        && checkedDecorator.property === decorator.property
                        && checkedDecorator.type === TSV.DecoratorTypes.NESTED);
                })) {
                    result['properties'][decorator.property] = this.getMappingProperties(Reflect.getMetadata('design:type', new model(), decorator.property));
                }
                else if (!result['properties'][decorator.property]) {
                    result['properties'][decorator.property] = { type: _.get(this.getPropertyType(model, decorator.property, propertyDecorators), decorator.property) };
                }
            }
        });
        return result;
    }
    getPropertyType(model, property, decorators) {
        let result = {};
        _.each(decorators, (decorator) => {
            if (decorator && !result[property]
                && decorator.property === property) {
                switch (decorator.type) {
                    case TSV.DecoratorTypes.IS_INT:
                        result[property] = 'integer';
                        break;
                    case TSV.DecoratorTypes.IS_FLOAT:
                    case TSV.DecoratorTypes.IS_DECIMAL:
                        result[property] = 'float';
                        break;
                    case TSV.DecoratorTypes.IP_ADDRESS:
                    case TSV.DecoratorTypes.MAC_ADDRESS:
                    case TSV.DecoratorTypes.EMAIL:
                    case TSV.DecoratorTypes.ALPHA:
                        result[property] = 'string';
                        break;
                    case TSV.DecoratorTypes.DATE:
                    case TSV.DecoratorTypes.DATE_AFTER:
                    case TSV.DecoratorTypes.DATE_BEFORE:
                    case TSV.DecoratorTypes.DATE_ISO8601:
                        result[property] = 'date';
                        break;
                }
            }
        });
        if (!result[property]) {
            switch (Reflect.getMetadata('design:type', new model(), property).name) {
                case 'String':
                    result[property] = 'string';
                    break;
                case 'Number':
                    result[property] = 'integer';
                    break;
                case 'Boolean':
                    result[property] = 'boolean';
                    break;
                case 'Object':
                default:
                    result[property] = 'object';
                    break;
            }
        }
        return result;
    }
    getIndexName(element) {
        if (this.elasticOptions.prefix) {
            return (this.elasticOptions.prefix + '-' + element.constructor.name).toLowerCase();
        }
        else {
            return element.constructor.name.toLowerCase();
        }
    }
    toElementArray(collection) {
        let that = this;
        let result = [];
        if (that.containsIDocuments(collection)) {
            for (let i = 0; i < collection.documents.length; i++) {
                let currDoc = collection.documents[i];
                let mappedName;
                this.elementStore.forEach((value, key, map) => {
                    let constr = value;
                    if (constr && !mappedName && constr.name.toLowerCase() === collection.collection.toString().toLowerCase()) {
                        mappedName = key;
                    }
                });
                result.push(that.getClassInstance(mappedName));
                for (let key in currDoc) {
                    result[i][key] = currDoc[key];
                }
            }
            return Promise.resolve(result);
        }
        else {
            return Promise.reject(new Error('Could not determine class'));
        }
    }
}
Elements.loaderversion = 2;
exports.Elements = Elements;

//# sourceMappingURL=index.js.map
