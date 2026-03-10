export interface LocalServiceEntry {
  name: string;
  version: string;
  type: string;
  role?: string;
  ports?: Record<string, number[]>;
}

export interface LocalSiteServices {
  php: LocalServiceEntry;
  mysql?: LocalServiceEntry;
  mariadb?: LocalServiceEntry;
  nginx?: LocalServiceEntry;
  apache?: LocalServiceEntry;
  mailpit?: LocalServiceEntry;
  [key: string]: LocalServiceEntry | undefined;
}

export interface LocalSiteMysql {
  database: string;
  user: string;
  password: string;
}

export interface LocalSiteConfig {
  id: string;
  name: string;
  domain: string;
  path: string;
  services: LocalSiteServices;
  ports: Record<string, unknown>;
  mysql: LocalSiteMysql;
  environment?: string;
  multiSite?: string;
  localVersion?: string;
}

export interface WpCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SitesJson {
  [siteId: string]: LocalSiteConfig;
}
