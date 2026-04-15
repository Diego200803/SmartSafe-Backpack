import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ProfilePopoverComponent } from '../tabs/tab1/profile-popover.component';

@NgModule({
  declarations: [ProfilePopoverComponent],
  imports: [CommonModule, IonicModule],
  exports: [ProfilePopoverComponent]
})
export class SharedModule {}