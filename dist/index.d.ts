import 'reflect-metadata';
import * as TSV from 'tsvalidate';
import { IElement } from './interfaces/IElement';
import { IDocuments } from './interfaces/IDocuments';
import { IIndexSettings } from './interfaces/IIndexSettings';
export { Element as Element } from './classes/Element';
export declare class Elements {
    static loaderversion: number;
    private mongoClient;
    private mongoConnection;
    private elasticClient;
    private elasticConnection;
    private elasticOptions;
    private elementStore;
    constructor(mlcl?: any, config?: any);
    connect(): Promise<void>;
    registerClass(name: string, definition: any, indexSettings?: IIndexSettings): Promise<void>;
    getClass(name: string): IElement;
    getClassInstance(name: string): any;
    validate(instance: Object): TSV.IValidatorError[];
    toDbObject(element: IElement): any;
    protected toDbObjRecursive(obj: Object, nested: boolean): any;
    mongoClose(): Promise<any>;
    protected getMongoConnection(): any;
    protected getElasticConnection(): any;
    getMongoCollections(): Promise<any>;
    protected containsIDocuments(obj: any): boolean;
    findByQuery(collection: string | IElement, query?: any, limit?: number): Promise<any>;
    findById(id: number | string | IElement, collection?: string | IElement): Promise<any>;
    search(query: Object): Promise<any>;
    protected mongoConnectWrapper(): Promise<any>;
    protected connectMongo(): Promise<void>;
    protected elasticConnectWrapper(): PromiseLike<any>;
    protected connectElastic(): Promise<void>;
    protected updateMongoElements(instances: IElement[], collectionName: string, upsert?: boolean): Promise<any>;
    protected updateMongoElementSingle(instance: IElement, collectionName: string, upsert?: boolean): Promise<any>;
    protected validateAndSort(instances: IElement[]): Promise<any>;
    protected mongoUpdate(collections: Object, upsert?: boolean): Promise<any>;
    saveInstances(instances: IElement[], upsert?: boolean): Promise<any>;
    createElastic(element: IElement): Promise<any>;
    protected updateElasticElementSingle(element: IElement, upsert?: boolean): Promise<any>;
    protected registerIndex(name: string, definition: any, indexSettings?: IIndexSettings): Promise<any>;
    protected getPropertyType(source: any, decorators: any): Object;
    protected getIndexName(element: IElement): string;
    protected toElementArray(collection: IDocuments): Promise<any>;
}
