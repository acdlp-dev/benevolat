import { Component, OnInit, OnDestroy } from '@angular/core';
import { BackofficeAuthService } from '../../../../modules/backoffice-auth/services/backoffice-auth.service';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { LucideIconsModule } from '../../../../shared/modules/lucide-icons.module';

interface TabItem {
  key: string;
  label: string;
  icon: string;
  route: string;
  badge?: boolean;
}

interface TabSection {
  key: string;
  label: string;
  items: TabItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    LucideIconsModule
  ],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit, OnDestroy {
  isSidebarOpen: boolean = false;

  // Sections regroupées pour l'affichage
  sections: TabSection[] = [];

  activeTab: string = 'backoffice';
  // État d'ouverture des sections (par défaut toutes ouvertes)
  openSections: { [key: string]: boolean } = {};

  private resizeHandler: (() => void) | null = null;

  constructor(
    private router: Router,
    private backofficeAuthService: BackofficeAuthService,
  ) { }

  ngOnInit(): void {
    this.setTabsForModule();

    // Initialiser la sidebar ouverte sur desktop, fermée sur mobile
    this.isSidebarOpen = window.innerWidth >= 768;

    // Écouter les changements de taille d'écran avec cleanup
    this.resizeHandler = () => {
      if (window.innerWidth >= 768) {
        this.isSidebarOpen = true;
      }
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  ngOnDestroy(): void {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
  }

  toggleSection(key: string): void {
    this.openSections[key] = !this.openSections[key];
  }

  private setTabsForModule(): void {
    this.sections = [];

    // Bénévolat section
    const benevolatItems: TabItem[] = [
      { key: 'benevolat-benevoles', label: 'Bénévoles', icon: 'users', route: '/backoffice/benevolat/benevoles' },
      { key: 'benevolat-actions', label: 'Créer une action', icon: 'plus-circle', route: '/backoffice/benevolat/actions' },
      { key: 'benevolat-actions-list', label: 'Liste des actions', icon: 'list', route: '/backoffice/benevolat/actions-list' },
      { key: 'benevolat-calendar', label: 'Calendrier', icon: 'calendar', route: '/backoffice/benevolat/calendar' },
      { key: 'benevolat-attestations', label: 'Attestations', icon: 'file-text', route: '/backoffice/benevolat/attestations' }
    ];
    this.sections.push({ key: 'benevolat', label: 'Bénévolat', items: benevolatItems });

    // Account / Logout section at the end
    const accountItems: TabItem[] = [
      { key: 'infos', label: 'Mes infos', icon: 'id-card', route: '/backoffice/infos' },
      { key: 'parametres', label: 'Paramètres', icon: 'settings', route: '/backoffice/parametres' },
      { key: 'logout', label: 'Déconnexion', icon: 'log-out', route: '/backoffice-auth/sign-in' }
    ];
    this.sections.push({ key: 'account', label: 'Compte', items: accountItems });

    // Initialiser l'état d'ouverture pour chaque section (par défaut ouvert)
    this.sections.forEach(s => {
      if (this.openSections[s.key] === undefined) {
        this.openSections[s.key] = true;
      }
    });
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebarOnMobile(): void {
    if (window.innerWidth < 768) {
      this.isSidebarOpen = false;
    }
  }

  // Vérifier si un onglet est actif
  isActiveTab(key: string): boolean {
    if (key === 'dashboard') {
      return this.router.url.endsWith('/backoffice/accueil') || this.router.url.endsWith('/backoffice/accueil/');
    }

    // Pour les routes avec sous-chemins
    if (key.includes('/')) {
      return this.router.url.endsWith('/backoffice/' + key);
    }

    // Gestion standard pour les autres routes
    return this.router.url.includes(`/backoffice/${key}`);
  }

  onTabClick(tabKey: string): void {
    this.activeTab = tabKey;
  }

  getInitials(): string {
    return 'YA';
  }

  onLogout(): void {
    this.backofficeAuthService.logout();
  }
}
