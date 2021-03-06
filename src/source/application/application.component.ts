import {Component, OnDestroy} from '@angular/core';
import {IApplication, IManagedObject} from '@c8y/client';
import download from "downloadjs";
import {BehaviorSubject, Subscription} from "rxjs";
import {DataService} from "../../data.service";
import {SelectionService} from "../../selection.service";
import {delay, sortById} from "../../utils/utils";
import {AlertService} from "@c8y/ngx-components";
import {UpdateableAlert} from "../../utils/UpdateableAlert";
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
import {DataClient} from "../../DataClient";
import { uniqBy } from 'lodash';

@Component({
    templateUrl: './application.component.html'
})
export class ApplicationComponent implements OnDestroy {
    private dataClient: DataClient;
    showAll$: BehaviorSubject<boolean> = new BehaviorSubject(false);
    allApplications: Promise<(IApplication & {id: string|number, binary: IManagedObject} & {applicationBuilder?: any})[]>;
    filteredApplications: Promise<(IApplication & {id: string|number, binary: IManagedObject, downloading?:boolean})[]>;

    showAllSubscription: Subscription;

    constructor(private dataService: DataService, private selectionService: SelectionService, private alertService: AlertService) {
        this.load();
    }

    load() {
        this.dataClient = this.dataService.getSourceDataClient();
        this.allApplications = this.dataClient.getApplicationsWithBinaries();
        this.showAllSubscription = this.showAll$.subscribe(showAll => {
            this.filteredApplications = this.allApplications.then(apps => sortById(apps.filter(app => showAll || app.binary || app.applicationBuilder)));
        });
    }

    async downloadApplication(event: MouseEvent, app: (IApplication & {binary: IManagedObject, downloading?:boolean}), appBinary: IManagedObject) {
        event.stopPropagation();
        if (app.downloading) {
            this.alertService.danger('Please wait for the current download to finish');
            return;
        }
        app.downloading = true;
        const downloadAlert = new UpdateableAlert(this.alertService);
        const blob = await this.dataClient.getApplicationBlob(app, progress => {
            downloadAlert.update(`Downloading... ${(progress * 100).toFixed(0)}%`);
        });
        downloadAlert.update('Opening...');
        download(blob, appBinary.name);
        await delay(4000);
        downloadAlert.close();
        app.downloading = false;
    }

    async toggleSelection(app: (IApplication & {id: string|number, binary: IManagedObject, downloading?:boolean})) {
        if (app.downloading) {
            this.alertService.danger('Please wait for the current download to finish');
            return;
        }
        if (this.isSelected(app)) {
            this.selectionService.deselect(app.id);
        } else {
            app.downloading = true;
            const downloadAlert = new UpdateableAlert(this.alertService);
            this.selectionService.select(app.id);
            const {
                dashboards: linkedDashboards,
                devices: linkedDevicesFromApp
            } = await this.dataClient.findReferencedFromApplication(app, (progress) => {
                downloadAlert.update(`Searching for linked Dashboards, Groups and Devices...\nDownloading application: ${(progress * 100).toFixed(0)}%`);
            });
            downloadAlert.update(`Searching for linked Dashboards, Groups and Devices...\nExtracting and searching...`);
            let allGroups = [];
            let allDevices = [];
            let allSimulators = [];
            let allSmartRules = [];
            let allBinaries = [];
            let allOther = [];
            const dashboardCount = (await Promise.all(linkedDashboards.map(async dashboard => {
                this.selectionService.select(dashboard.id, app.id);
                const {devices, groups, simulators, smartRules, binaries, other, childParentLinks} = await this.dataClient.findLinkedFromDashboard(dashboard);
                childParentLinks.forEach(({child, parent}) => {
                    this.selectionService.select(child, parent);
                });
                allGroups.push(...groups);
                allDevices.push(...devices);
                allSimulators.push(...simulators);
                allSmartRules.push(...smartRules);
                allBinaries.push(...binaries);
                allOther.push(...other);
            }))).length;
            await Promise.all(linkedDevicesFromApp.map(async device => {
                this.selectionService.select(device.id, app.id);
                const {devices, groups, simulators, smartRules, other, childParentLinks} = await this.dataClient.findLinkedFrom(device);
                childParentLinks.forEach(({child, parent}) => {
                    this.selectionService.select(child, parent);
                });
                allGroups.push(...groups);
                allDevices.push(...devices);
                allSimulators.push(...simulators);
                allSmartRules.push(...smartRules);
                allOther.push(...other);
            }))
            allGroups = uniqBy(allGroups, group => group.id);
            allDevices = uniqBy(allDevices, device => device.id);
            allSimulators = uniqBy(allSimulators, simulator => simulator.id);
            allSmartRules = uniqBy(allSmartRules, smartRule => smartRule.id);
            allBinaries = uniqBy(allBinaries, binary => binary.id);
            allOther = uniqBy(allOther, other => other.id);

            downloadAlert.update(`Links found: ${dashboardCount} Dashboards, ${allGroups.length} Groups, ${allDevices.length} Devices, ${allSimulators.length} Simulators, ${allSmartRules.length} Smart Rules, ${allBinaries.length} Binaries, ${allOther.length} Other`);
            downloadAlert.close(5000);
            app.downloading = false;
        }
    }

    isSelected(o: {id: string|number}) {
        return this.selectionService.isSelected(o.id);
    }

    trackById(index, value) {
        return value.id;
    }

    reload() {
        this.showAllSubscription.unsubscribe();
        this.dataClient.invalidateCache();
        this.load();
    }

    openApplication(event: MouseEvent, app: IApplication) {
        event.stopPropagation();
        if (app.externalUrl) {
            window.open(app.externalUrl, '_blank');
        } else {
            const baseUrl = this.dataClient.getBaseUrl();
            window.open(`${baseUrl}/apps/${app.contextPath}`, '_blank');
        }
    }


    ngOnDestroy(): void {
        this.showAllSubscription.unsubscribe();
    }
}
