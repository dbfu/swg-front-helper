export interface MenuDTO {
  [k: string]: any;
}

export interface InterfaceDTO {
  path: string;
  method: string;
}

export interface MenuInterfaceDTO {
  menu_id: string;
  interface_infos: InterfaceDTO[];
}

export interface RolePageDTO {
  page: number;
  pageSize: number;
  code: string;
  name: string;
}

export interface RoleDTO {
  [k: string]: any;
}

export interface RoleMenuDTO {
  [k: string]: any;
}

export interface RoleInterfaceDTO {
  [k: string]: any;
}

export interface FileDTO {
  [k: string]: any;
}

export interface UserDTO {
  [k: string]: any
}

export interface UserPageDTO {
  page: number,
  pageSize: number,
}