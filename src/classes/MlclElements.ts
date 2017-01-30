'use strict';
import 'reflect-metadata';
import * as TSV from 'tsvalidate';
import * as _ from 'lodash';
// import * as ELD from './ElementDecorators';
import * as Interfaces from '../interfaces';
import {di, injectable} from '@molecuel/di';

@injectable
export class MlclElements {
  private databases: Map<string, Interfaces.IDatabaseAdapter> = new Map();
  constructor(databases: Interfaces.IDatabaseAdapter[]) {
    // this.databases = _.keyBy(databases, 'name');
    if (databases && _.isArray(databases)) {
      for (let database of databases) {
        this.databases.set(database.name, database);
      }
    }
  }

  public get loaderversion(): number { return 2; }

  /**
   * modified getInstance of di, setting handler to current instance
   * @param  {string}           name [description]
   * @return {Promise<void>}         [description]
   */
  public getInstance(name: string, ...params): any {
    if (_.includes(this.getClasses(), name)) {
      let instance = di.getInstance(name, ...params);
      if (instance && _.includes(Object.keys(instance), 'elements')) {
        instance.elements = this;
      }
      return instance;
    }
    else {
      return undefined;
    }
  }

  /**
   * explicit register of class for database(s)
   * @param  {string}           databaseName [description]
   * @return {Promise<void>}                 [description]
   */
  public registerModel(name: string): boolean {
    return false;
  }

  /**
   * Validator function for the instances
   * @param  {Object}        instance [description]
   * @return {Promise<void>}          [description]
   */
  public validate(instance: Object): TSV.IValidatorError[] {
      return (new TSV.Validator()).validate(instance);
  }

  /**
   * Convert object which can be saved in database
   * @param  {Element}     element [description]
   * @return {any}                 [description]
   */
  public toDbObject(element: Element): any {
    return this.toDbObjRecursive(element);
  }

  /**
   * Return string array of injectable Element extending classes
   * @return {string[]}                 [description]
   */
  public getClasses(): string[] {
    let result: string[] = [];
    for (let [name, injectable] of di.injectables) {
      if (injectable.injectable && new injectable.injectable() instanceof Element && name !== Element.name) {
        result.push(name);
      }
    }
    return result;
  }

  /**
   * Protected recursive object serialization
   * @param  {Object}  obj     [description]
   * @param  {boolean} nested  [description]
   * @return any               [description]
   */
  protected toDbObjRecursive(obj: Object, databaseName?: string): any {
    let that = obj;
    let result: any = {};
    let objectValidatorDecorators = Reflect.getMetadata(TSV.METADATAKEY, that);
    let propertiesValidatorDecorators = _.keyBy(objectValidatorDecorators, function(o: any) {
      return o.property;
    });
    for (let key in that) {
      // check for non-prototype, validator-decorated property
      if (Object.hasOwnProperty.call(that, key)
        && that[key] !== undefined
        && propertiesValidatorDecorators[key]) {
        // @todo: use key from IDatabaseAdapter
        // check for id
        if ((databaseName && this.databases.get(databaseName) && this.databases.get(databaseName).idPattern === key)
          || key === 'id') {

          result[key] = that[key];
        }
        // check if the property is an object
        else if (typeof that[key] === 'object') {

          result[key] = this.toDbObjRecursive(that[key]);
        }
        else if (typeof that[key] !== 'function') {

          result[key] = that[key];
        }
      }
    }
    return result;
  }

  /**
   * Wrapper for instance save
   * @param  {Element[]}                           instances [description]
   * @param  {boolean}                             upsert    [description]
   * @return {Promise<any>}                                  [description]
   */
  public async saveInstances(instances: Element[], upsert: boolean = false): Promise<any> {
    let result = {
      successCount:  0,
      errorCount: 0,
      errors: []
    };
    for (let instance of instances) {
      let persistDbs = _.filter([...this.databases.values()], 'type.persistanceLayer');
      let persistSuccessCount = 0;
      for (let persistDb of persistDbs) {
        try {
          await persistDb.save(instance.toDbObject);
          persistSuccessCount++;
        }
        catch (err) {
          result.errorCount++;
          resullt.errors.push(err);
        }
      }
      if (persistSuccessCount === persistDbs.length) {
        result.successCount++;
        let populDbs = _.filter([...this.databases.values()], 'type.populationLayer');
        for (let populDb of populDbs) {
          try {
            await populDb.save(instance.toDbObject);
          }
          catch (err) {
            result.errorCount++;
            resullt.errors.push(err);
          }
        }
      }
    }
    if (result.successCount) {
      return Promise.resolve(result);
    }
    else {
      return Promise.reject(result);
    }
  }

  /**
   * Wrapper for instance get
   * @param  {any}                                   query [description]
   * @return {Promise<any>}                                [description]
   */
  public async findInstances(query: any): Promise<any> {
    return Promise.reject(query);
  }

  /**
   * Wrapper for instance get by id
   * @param  {any}                                   id [description]
   * @return {Promise<any>}                             [description]
   */
  public async findInstanceById(id: any): Promise<any> {
    return await this.findInstances(id);
  }
}

import {Element} from './Element';
