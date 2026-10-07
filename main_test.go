package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidateGitHubRepo(t *testing.T) {
	tests := []struct {
		input string
		want  string
		valid bool
	}{
		{"https://github.com/owner/project", "https://github.com/owner/project.git", true},
		{"https://github.com/Owner/project.git/", "https://github.com/Owner/project.git", true},
		{"http://github.com/owner/project", "", false},
		{"https://github.com.evil.example/owner/project", "", false},
		{"https://user:pass@github.com/owner/project", "", false},
		{"https://github.com/owner/project?tab=readme", "", false},
		{"https://github.com/owner/project/tree/main", "", false},
		{"file:///tmp/project", "", false},
		{"https://github.com/../project", "", false},
	}
	for _, test := range tests {
		t.Run(test.input, func(t *testing.T) {
			got, err := validateGitHubRepo(test.input)
			if test.valid && err != nil {
				t.Fatalf("expected valid URL, got error: %v", err)
			}
			if !test.valid && err == nil {
				t.Fatalf("expected invalid URL, got %q", got)
			}
			if test.valid && got != test.want {
				t.Fatalf("got %q, want %q", got, test.want)
			}
		})
	}
}

func TestValidateSubdomain(t *testing.T) {
	valid, err := validateSubdomain(" My-App-2 ")
	if err != nil || valid != "my-app-2" {
		t.Fatalf("normalized subdomain = %q, %v", valid, err)
	}
	for _, value := range []string{"-bad", "bad-", "two words", "a.b", strings.Repeat("a", 64)} {
		if _, err := validateSubdomain(value); err == nil {
			t.Errorf("expected %q to be rejected", value)
		}
	}
	if value, err := validateSubdomain(""); err != nil || value != "" {
		t.Fatalf("empty subdomain should be allowed; got %q, %v", value, err)
	}
}

func TestDeploymentNameIsSafeAndDeterministic(t *testing.T) {
	first := deploymentName("https://github.com/Aiman003516/open-paas.git", "")
	if first != deploymentName("https://github.com/Aiman003516/open-paas.git", "") {
		t.Fatal("same deployment inputs should produce the same name")
	}
	if !containerPattern.MatchString(first) {
		t.Fatalf("generated container name is invalid: %q", first)
	}
	if first == deploymentName("https://github.com/Aiman003516/open-paas.git", "my-app") {
		t.Fatal("different subdomains must not collide")
	}
}

func TestMessageBrokerPublishDoesNotBlockWhenFull(t *testing.T) {
	broker := newMessageBroker()
	for i := 0; i < cap(broker.broadcast); i++ {
		if !broker.publish("{}") {
			t.Fatalf("queue unexpectedly filled at %d", i)
		}
	}
	if broker.publish("{}") {
		t.Fatal("publish should report a full queue instead of blocking")
	}
}

func TestDeployHandlerRejectsInvalidInput(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/deploy", strings.NewReader(`{"repo_url":"http://example.com/repo"}`))
	response := httptest.NewRecorder()
	deployHandler(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body=%s", response.Code, http.StatusBadRequest, response.Body.String())
	}
}

func TestMethodAndCORSHandling(t *testing.T) {
	handler := withCORS(healthHandler)
	request := httptest.NewRequest(http.MethodPost, "/health", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("method status = %d, want 405", response.Code)
	}

	request = httptest.NewRequest(http.MethodGet, "/health", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("allowed origin header = %q", got)
	}
	if got := response.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(strings.ToLower(got), "authorization") {
		t.Fatalf("CORS must allow the authenticated Authorization header, got %q", got)
	}
	request = httptest.NewRequest(http.MethodOptions, "/health", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("allowed CORS preflight status = %d, want 204", response.Code)
	}

	request = httptest.NewRequest(http.MethodGet, "/health", nil)
	request.Header.Set("Origin", "https://unexpected.example")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("unexpected origin must not be allowed, got %q", got)
	}
}

func TestAPITokenAuthentication(t *testing.T) {
	t.Setenv("OPEN_PAAS_API_TOKEN", "local-test-token")
	handler := requireAPIToken(healthHandler)
	tests := []struct {
		name       string
		authorize  string
		wantStatus int
	}{
		{"missing token", "", http.StatusUnauthorized},
		{"wrong token", "Bearer not-the-token", http.StatusUnauthorized},
		{"valid token", "Bearer local-test-token", http.StatusOK},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/health", nil)
			if test.authorize != "" {
				request.Header.Set("Authorization", test.authorize)
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d", response.Code, test.wantStatus)
			}
		})
	}
	t.Setenv("OPEN_PAAS_API_TOKEN", "")
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("missing server token status = %d, want 503", response.Code)
	}
}
