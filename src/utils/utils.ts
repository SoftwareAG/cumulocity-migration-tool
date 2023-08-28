/*
* Copyright (c) 2019 Software AG, Darmstadt, Germany and/or its licensors
*
* SPDX-License-Identifier: Apache-2.0
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*    http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
 */
import _ from 'lodash';
import {Observable} from "rxjs";
import {IManagedObject, IApplication} from '@c8y/client';
import objectScan from "object-scan";
import {IExternalId} from "../c8y-interfaces/IExternalId";

export function toNumber(value?: string|number) {
    return +value;
}

export function sortById<T extends {id?: string|number}>(arr: T[]): T[] {
    return [...arr].sort((a, b) => {
        const numberA = toNumber(a.id);
        const numberB = toNumber(b.id);
        if (_.isFinite(numberA)) {
            if (_.isFinite(numberB)) {
                return numberA - numberB;
            } else {
                return -1;
            }
        } else if (_.isFinite(numberB)) {
            return 1;
        } else {
            return a.id === b.id ? 0 : a.id < b.id ? -1 : 1
        }
    });
}

export function delay(timeout: number) {
    return new Promise(resolve => setTimeout(resolve, timeout));
}

export function getValueSync<T>(source: Observable<T>): T|undefined {
    let result = undefined;
    source.subscribe(val => result = val).unsubscribe();
    return result;
}

export function getDashboardName(dashboard: IManagedObject) {
    const named = Object.keys(dashboard).find(k => k.startsWith('c8y_Dashboard!name!'));
    if (named) {
        return named.replace('c8y_Dashboard!name!', '');
    } else {
        const definition = dashboard.c8y_Dashboard;
        if (definition) {
            return definition.name || dashboard.name || '-';
        } else {
            return dashboard.name || '-';
        }
    }
}

export function getIdPathsFromApplication(application: IApplication): string[][] {
    const isNumberOrString = (key, value) => _.isString(value) || _.isNumber(value);

    return _.uniqBy([
        ...objectScan(['**.device', '**.device*id', '**.device*Id', '**.device*ID'], {useArraySelector: false, joined: false, filterFn: isNumberOrString})(application)
    ], JSON.stringify);
}

export function getIdPathsFromDashboard(dashboard: IManagedObject): string[][] {
    const isNumberOrString = (key, value) => _.isString(value) || _.isNumber(value);

    return objectScan([
        'c8y_Dashboard.**.device.id',
        'c8y_Dashboard.**.__target.id',
        'c8y_Dashboard.**.device',
        'c8y_Dashboard.**.device*id', 'c8y_Dashboard.**.device*Id', 'c8y_Dashboard.**.device*ID',
        'c8y_Dashboard.**.*binary*id', 'c8y_Dashboard.**.*binary*Id', 'c8y_Dashboard.**.*binary*ID',
        'c8y_Dashboard.**.*Binary*id', 'c8y_Dashboard.**.*Binary*Id', 'c8y_Dashboard.**.*Binary*ID'
    ], {
        useArraySelector: false,
        joined: false,
        filterFn: isNumberOrString
    })(dashboard);
}

export function isSimulatorDevice(device: IManagedObject): boolean {
    return device.hasOwnProperty('c8y_IsDevice') && device.owner === 'service_device-simulator';
}

export function getSimulatorId(device: (IManagedObject & {externalIds: IExternalId[]})): string | undefined {
    if (!isSimulatorDevice(device)) return undefined;

    const externalIdRegex = /^simulator_(\d+)_(\d+)$/;
    const externalIdObj = device.externalIds.find(ext => externalIdRegex.test(ext.externalId));

    if (externalIdObj) {
        return externalIdObj.externalId.match(externalIdRegex)[1];
    }
    return undefined;
}

export function setFromPath(object: any, path: (string | number)[], value: any) {
    if (path.length === 1) {
        if (_.isArray(object) && _.isNumber(path[0])) {
            while (object.length < path[0]) {
                object.push(undefined);
            }
        }
        object[path[0]] = value;
        return object;
    }

    if (object[path[0]] == undefined) {
        if (path.length > 1 && _.isNumber(path[1])) {
            setFromPath(object, [path[0]], []);
        } else {
            setFromPath(object, [path[0]], {});
        }
    }

    setFromPath(object[path[0]], path.slice(1), value);
    return object;
}
