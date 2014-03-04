(defproject rarousnet "1.0.0-SNAPSHOT"
  :description "FIXME: write description"
  :url "http://rarousnet.herokuapp.com"
  :license {:name "FIXME: choose"
            :url "http://example.com/FIXME"}
  :dependencies [[org.clojure/clojure "1.6.0-beta1"]
                 [compojure "1.1.6"]
                 [ring "1.2.1"]
                 [ring-basic-authentication "1.0.5"]
                 [environ "0.4.0"]
                 [com.cemerick/drawbridge "0.0.6"]
                 [enlive "1.1.5"]
                 [clj-time "0.6.0"]]
  :min-lein-version "2.0.0"
  :plugins [[lein-environ "0.4.0"]
            [lein-midje "3.0.0"]]
  :resource-paths ["src/rarousnet" "resources"]
  :profiles {:production
             {:env {:production true}
              :java-agents [[com.newrelic.agent.java/newrelic-agent "3.4.2"]]}

             :dev
             {:dependencies [[midje "1.6.2"]]}}
  :main rarousnet.web)
