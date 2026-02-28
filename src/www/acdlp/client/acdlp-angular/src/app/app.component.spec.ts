import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { standardTestingModules, standardTestingProviders } from './shared/testing/test-helpers';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AppComponent,
        ...standardTestingModules,
        HttpClientTestingModule
      ],
      providers: [
        ...standardTestingProviders
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have as title 'ACDLP'`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('ACDLP');
  });

 // it('should render title', () => {
 //   const fixture = TestBed.createComponent(AppComponent);
 //   fixture.detectChanges();
 //   const compiled = fixture.nativeElement as HTMLElement;
 //   expect(compiled.querySelector('.content span')?.textContent).toContain('angular-tailwind app is running!');
 // });
});
