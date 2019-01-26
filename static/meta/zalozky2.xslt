<?xml version="1.0" encoding="utf-8" ?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
	<xsl:template match="/">
		<ul>
			<xsl:for-each select="xbel/folder | xbel/bookmark | xbel/separator">
				<xsl:call-template name="folderInternal" />
			</xsl:for-each>
		</ul>
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
			<div class="folderList" style="display:none;">
				<ul>
					<xsl:for-each select="folder | bookmark | separator">
						<xsl:call-template name="folderInternal" />
					</xsl:for-each>
				</ul>
			</div>
		</li>
	</xsl:template>
	<xsl:template name="bookmarkElement" match="bookmark">
		<li>
			<xsl:for-each select="./info">
				<xsl:call-template name="infoElement" />
			</xsl:for-each>
			<xsl:if test="not(./info)">
				<xsl:attribute name="style">list-style-image:none;</xsl:attribute>
			</xsl:if>
			<xsl:element name="a">
				<xsl:attribute name="href">
					<xsl:value-of select="./@href" />
				</xsl:attribute>
				<xsl:attribute name="title">
					<xsl:value-of select="./desc" />
				</xsl:attribute>
				<xsl:value-of select="./title" />
			</xsl:element>
		</li>
	</xsl:template>
	<xsl:template name="separatorElement" match="separator">
		<li class="separator">
			<hr />
		</li>
	</xsl:template>
	<!--  Favicon Impl -->
	<xsl:template name="infoElement" match="info">
		<xsl:for-each select="./metadata">
			<xsl:call-template name="metadataElement" />
		</xsl:for-each>
	</xsl:template>
	<xsl:template name="metadataElement" match="metadata">
		<xsl:if test="@owner='Mozilla'">
			<xsl:if test="@Icon">
				<xsl:attribute name="style">list-style-image:url(<xsl:value-of select="@Icon" />);</xsl:attribute>
			</xsl:if>
			<xsl:choose>
				<xsl:when test="@Icon">
					<xsl:attribute name="style">list-style-image:url(<xsl:value-of select="@Icon" />);</xsl:attribute>
				</xsl:when>
				<xsl:otherwise>
					<xsl:attribute name="style">list-style-image:none;</xsl:attribute>
				</xsl:otherwise>
			</xsl:choose>
			<xsl:if test="@FeedURL">
				<xsl:element name="a">
					<xsl:attribute name="href">
						<xsl:value-of select="@FeedURL" />
					</xsl:attribute>
					<xsl:element name="img">
						<xsl:attribute name="src">rss.png</xsl:attribute>
						<xsl:attribute name="width">28</xsl:attribute>
						<xsl:attribute name="height">16</xsl:attribute>
						<xsl:attribute name="alt">RSS</xsl:attribute>
					</xsl:element>
				</xsl:element>
				<span class="spacer" />
			</xsl:if>
		</xsl:if>
	</xsl:template>
</xsl:stylesheet>