import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Office add-in manifest for Microsoft Word, built for this portal's address.
 * Download it from Word setup, then add it to Word (or deploy it to everyone
 * from the Microsoft 365 admin centre). Office requires HTTPS.
 */
export function GET(req: NextRequest) {
  const origin = (process.env.PORTAL_URL || req.nextUrl.origin).replace(/\/$/, "");
  // A stable id for this installation, so updates replace the same add-in
  const hex = crypto.createHash("sha256").update(`ssa-word-addin:${origin}`).digest("hex");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0" xmlns:ov="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="TaskPaneApp">
  <Id>${id}</Id>
  <Version>1.0.0.0</Version>
  <ProviderName>Segun Sipeolu &amp; Associates</ProviderName>
  <DefaultLocale>en-GB</DefaultLocale>
  <DisplayName DefaultValue="SOS&amp;A Portal"/>
  <Description DefaultValue="Save documents from Word into the firm's Practice Portal, on the right matter, with version history."/>
  <IconUrl DefaultValue="${origin}/word/icon-32.png"/>
  <HighResolutionIconUrl DefaultValue="${origin}/word/icon-64.png"/>
  <SupportUrl DefaultValue="${origin}/portal/word/setup"/>
  <AppDomains><AppDomain>${origin}</AppDomain></AppDomains>
  <Hosts><Host Name="Document"/></Hosts>
  <DefaultSettings><SourceLocation DefaultValue="${origin}/word/taskpane.html"/></DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Hosts>
      <Host xsi:type="Document">
        <DesktopFormFactor>
          <ExtensionPoint xsi:type="PrimaryCommandSurface">
            <OfficeTab id="TabHome">
              <Group id="SSA.Group">
                <Label resid="SSA.Group.Label"/>
                <Icon><bt:Image size="16" resid="SSA.Icon16"/><bt:Image size="32" resid="SSA.Icon32"/><bt:Image size="80" resid="SSA.Icon80"/></Icon>
                <Control xsi:type="Button" id="SSA.Save">
                  <Label resid="SSA.Save.Label"/>
                  <Supertip><Title resid="SSA.Save.Label"/><Description resid="SSA.Save.Tip"/></Supertip>
                  <Icon><bt:Image size="16" resid="SSA.Icon16"/><bt:Image size="32" resid="SSA.Icon32"/><bt:Image size="80" resid="SSA.Icon80"/></Icon>
                  <Action xsi:type="ShowTaskpane"><TaskpaneId>SSA.Pane</TaskpaneId><SourceLocation resid="SSA.Pane.Url"/></Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>
    <Resources>
      <bt:Images>
        <bt:Image id="SSA.Icon16" DefaultValue="${origin}/word/icon-16.png"/>
        <bt:Image id="SSA.Icon32" DefaultValue="${origin}/word/icon-32.png"/>
        <bt:Image id="SSA.Icon80" DefaultValue="${origin}/word/icon-80.png"/>
      </bt:Images>
      <bt:Urls><bt:Url id="SSA.Pane.Url" DefaultValue="${origin}/word/taskpane.html"/></bt:Urls>
      <bt:ShortStrings>
        <bt:String id="SSA.Group.Label" DefaultValue="SOS&amp;A Portal"/>
        <bt:String id="SSA.Save.Label" DefaultValue="Save to Portal"/>
      </bt:ShortStrings>
      <bt:LongStrings><bt:String id="SSA.Save.Tip" DefaultValue="Save this document to a matter in the Practice Portal, as a new recorded version."/></bt:LongStrings>
    </Resources>
  </VersionOverrides>
</OfficeApp>
`;
  return new NextResponse(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": 'attachment; filename="ssa-portal-word-addin.xml"', "Cache-Control": "no-store" } });
}
