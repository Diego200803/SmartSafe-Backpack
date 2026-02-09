import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginaInicioPage } from './pagina-inicio.page';

describe('PaginaInicioPage', () => {
  let component: PaginaInicioPage;
  let fixture: ComponentFixture<PaginaInicioPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PaginaInicioPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
