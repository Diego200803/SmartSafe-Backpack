import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PaginaInicioPage } from './pagina-inicio.page';

const routes: Routes = [
  {
    path: '',
    component: PaginaInicioPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PaginaInicioPageRoutingModule {}
