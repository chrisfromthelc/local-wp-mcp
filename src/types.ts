export interface LocalSiteServices {
  php: { type: string; version: string };
  mysql: { type: string; version: string };
  nginx: { type: string; version: string };
}

export interface LocalSitePorts {
  NGINX?: string[];
  MYSQL?: string[];
}

export interface LocalSiteMysql {
  database: string;
  user: string;
  password: string;
}

export interface LocalSitePaths {
  webRoot: string;
  runData: string;
}

export interface LocalSiteConfig {
  id: string;
  name: string;
  domain: string;
  path: string;
  services: LocalSiteServices;
  ports: LocalSitePorts;
  mysql: LocalSiteMysql;
  paths: LocalSitePaths;
}

export interface WpCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SitesJson {
  [siteId: string]: LocalSiteConfig;
}
