<?xml version="1.0" encoding="UTF-8"?>
  <xsl:stylesheet version="1.0"
                  xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="/">
    <html>
      <head>
        <title><xsl:value-of select="xbel/title" /></title>
        <link rel="stylesheet" type="text/css" href="../data/xbel.css" media="all" />
        <script type="text/javascript">
<![CDATA[
function toggleDisplay(aEvent)
{
  var target;

  if("fromElement" in aEvent){
    target=aEvent.srcElement.nextSibling;
  }
  else if("target" in aEvent){
    target=aEvent.target.nextSibling;
  }
  var i=0;
  while(target && target.nodeName.toUpperCase()!="DIV" && i++>100)
    target=target.nextSibling;
  if(!target || i>100)
    return;
  var visible=target.style.display;
  target.style.display=(!visible || visible=="block")? "none":"block";
}
]]>
        </script>
      </head>
      <body>
        <h3 align="center"><xsl:value-of select="xbel/title" /></h3>
        <div class="xbel">
          <ul>
            <xsl:for-each select="xbel/folder | xbel/bookmark | xbel/separator">
              <xsl:call-template name="folderInternal" />
            </xsl:for-each>
          </ul>
        </div>
      </body>
    </html>
  </xsl:template>
  
  <xsl:template name="folderInternal" match="folder | bookmark | separator">
    <xsl:choose>
      <xsl:when test="local-name(.)='folder'">
        <xsl:call-template name="folderElement" />
      </xsl:when>
      <xsl:when test="local-name(.)='bookmark'">
        <xsl:call-template name="bookmarkElement" />
      </xsl:when>
      <xsl:when test="local-name(.)='separator'">
        <xsl:call-template name="separatorElement" />
      </xsl:when>
    </xsl:choose>
  </xsl:template>
  
  <xsl:template name="folderElement" match="folder">
    <li class="folder">
      <span class="folderName" onclick="toggleDisplay(event);">
        <xsl:attribute name="title">
          <xsl:value-of select="./desc" />
        </xsl:attribute>
        <xsl:value-of select="./title" />
      </span>
      <div class="folderList" style="display:none;"></DIV></LI>