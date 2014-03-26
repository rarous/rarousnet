(defproject rarousnet "1.0.0-SNAPSHOT"
  :description "rarous.net web site"
  :url "http://rarous.net/"
  :license {:name "Apache License, Version 2.0"
            :url "https://www.apache.org/licenses/LICENSE-2.0.html"}
  :min-lein-version "2.0.0"
  :main rarousnet.web
  :dependencies [[org.clojure/clojure "1.6.0"]
                 [clj-time "0.6.0"]
                 [compojure "1.1.6"]
                 [enlive "1.1.5"]
                 [environ "0.4.0"]
                 [http-kit "2.1.18"]
                 [ring "1.2.2"]
                 [ring-basic-authentication "1.0.5"]
                 [rm-hull/ring-gzip-middleware "0.1.7"]
                 [com.cemerick/drawbridge "0.0.6"]]
  :plugins [[lein-ancient "0.5.5"]
            [lein-environ "0.4.0"]
            [lein-midje "3.1.3"]]
  :resource-paths ["src/rarousnet" "resources"]
  :profiles {:dev {:env {:production false}
                   :dependencies [[midje "1.6.3"]]}
             :production {:env {:production true}
                          :java-agents [[com.newrelic.agent.java/newrelic-agent "3.4.2"]]}})
