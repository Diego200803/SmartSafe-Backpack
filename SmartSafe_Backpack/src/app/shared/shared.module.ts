import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ProfilePopoverComponent } from '../tabs/tab1/profile-popover.component';
import { TempAlertComponent } from './temp-alert/temp-alert.component';

@NgModule({
  declarations: [ProfilePopoverComponent, TempAlertComponent],
  imports: [CommonModule, IonicModule],
  exports: [ProfilePopoverComponent, TempAlertComponent]
})
export class SharedModule {}