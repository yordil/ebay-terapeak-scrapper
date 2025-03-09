export interface FormData {
	searchUrl: string;
	baseUrl: string;
	itemSpecific: string;
	email: string;
}
export interface ProxySettings {
	host: string;
	port: string;
	userName: string;
	password: string;
}

export interface Viewport {
	width: number;
	height: number;
}

export interface Profile {
	eBay: {
		userName: string;
		password: string;
	};
	proxy: ProxySettings;
	userAgent: string;
	viewport: Viewport;
}

export interface UserAssignment {
	user: UserDataWithCookies;
	data: string[];
}

export interface UserAssignmentForTURL {
	user: UserDataWithCookies;
	data: Array<{
		enTranslation: string;
		jpKeyword: string;
		originalIndex: number; // Add original index tracking
		link :string;
	}>;
}


export interface UserData {
	eBay: {
		userName: string;
		password: string;
	};
	proxy: {
		host: string;
		port: string;
		userName: string;
		password: string;
	};
	userAgent: string;
	viewport: {
		width: number;
		height: number;
	};
}

export interface CsvInputData {
	Identity: string;
	"JP Keyword": string;
	TURL: string;
	MURL: string;
	YURL: string;
	"eBay Page" : string;

}


export interface successfulCookies {
  userName: string;
  cookies: any;
}

export interface UserDataWithCookies {
  eBay: {
    userName: string;
    password: string;
  };
  proxy: {
    host: string;
    port: string;
    userName: string;
    password: string;
  };
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  cookies: any;
}

export interface ProxyInput {
	proxyURL: string,
	username: string,
	password: string,
  }
  
  interface OutPutForYM {
	keyword: string;
	originalIndex: number;
	searchUrl: string;
}


export interface itemsTitle{
	title: string, 
	pageLink : string
}

export interface translatedTitle {
	identity: string,
	title : string, 
	keyword: string, 
	jpKeyword: string,
	enTranslation: string,
	link :string
}